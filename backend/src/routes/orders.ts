import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requirePayment, AuthRequest } from '../middleware/auth';
import { getTrackingInfo } from '../services/tracking';
import { dedupeEvents } from '../services/tracking/normalization';
import { TrackingProviderError } from '../services/tracking/types';

const router = Router();
const prisma = new PrismaClient();

function deriveStatusForDedup(
  trackingNumber: string | null | undefined,
  emailStatus: string | null | undefined,
  deliveryAddress: string | null | undefined,
  currentStatus: string,
): string {
  // Bereits vom Tracking-Poller gesetzt → nicht überschreiben
  if (currentStatus === 'exception') return 'in transit';
  if (['delivered', 'in transit', 'in packstation'].includes(currentStatus)) return currentStatus;
  const delivered   = /zugestellt|geliefert|delivered|angekommen|abgeholt/i;
  const inTransit   = /unterwegs|versandt|shipped|on the way|in transit|im versand/i;
  const packstation = /packstation|paketstation|parcel.?locker|abholstation/i;
  if (emailStatus && packstation.test(emailStatus)) return 'in packstation';
  if (emailStatus && delivered.test(emailStatus))   return 'delivered';
  if (emailStatus && inTransit.test(emailStatus))   return 'in transit';
  // Keine Tracking-Nummer oder keine Lieferadresse → Sendung liegt bereits vor
  if (!trackingNumber) return 'delivered';
  if (!deliveryAddress) return 'delivered';
  return 'processing';
}

/**
 * Fasst alle Bestellungen mit gleicher orderNumber eines Nutzers zusammen.
 * Wird automatisch nach jedem Sync aufgerufen.
 */
export async function deduplicateOrders(userId: string): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { userId, orderNumber: { not: null } },
    orderBy: { orderDate: 'asc' },
    include: { attachments: true, trackingEvents: true },
  });

  const groups = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = order.orderNumber!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(order);
  }

  let mergedCount = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    const [primary, ...duplicates] = group;
    const patch: Record<string, unknown> = {};

    for (const dup of duplicates) {
      if (!primary.trackingNumber && dup.trackingNumber) patch.trackingNumber = dup.trackingNumber;
      if (!primary.carrier && dup.carrier) patch.carrier = dup.carrier;
      if (!primary.price && dup.price) patch.price = dup.price;
      if (!primary.estimatedDelivery && dup.estimatedDelivery) patch.estimatedDelivery = dup.estimatedDelivery;
      if (!primary.emailBody && dup.emailBody) patch.emailBody = dup.emailBody;
      if (!primary.emailBodyHtml && dup.emailBodyHtml) patch.emailBodyHtml = dup.emailBodyHtml;
      if (!primary.emailStatus && dup.emailStatus) patch.emailStatus = dup.emailStatus;
      if (!primary.deliveryAddress && dup.deliveryAddress) patch.deliveryAddress = dup.deliveryAddress;
    }

    // Status nach Merge neu ableiten
    const finalTracking = (patch.trackingNumber as string | null) ?? primary.trackingNumber;
    const finalEmailStatus = (patch.emailStatus as string | null) ?? primary.emailStatus;
    const finalAddress = (patch.deliveryAddress as string | null) ?? primary.deliveryAddress;
    patch.status = deriveStatusForDedup(finalTracking, finalEmailStatus, finalAddress, primary.status);

    await prisma.order.update({ where: { id: primary.id }, data: patch });

    for (const dup of duplicates) {
      await prisma.orderAttachment.updateMany({ where: { orderId: dup.id }, data: { orderId: primary.id } });
      await prisma.trackingEvent.updateMany({ where: { orderId: dup.id }, data: { orderId: primary.id } });
      await prisma.orderEmail.updateMany({ where: { orderId: dup.id }, data: { orderId: primary.id } });
      await prisma.order.delete({ where: { id: dup.id } });
      mergedCount++;
    }
  }

  return mergedCount;
}

// POST /api/orders/merge
// Führt mehrere Bestellungen in eine zusammen.
// Body: { primaryId: string, secondaryIds: string[] }
router.post('/merge', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const userId = String(req.user!.id);
  const { primaryId, secondaryIds } = req.body as { primaryId?: string; secondaryIds?: string[] };

  if (!primaryId || !Array.isArray(secondaryIds) || secondaryIds.length === 0) {
    return res.status(400).json({ error: 'primaryId und mindestens eine secondaryId erforderlich' });
  }

  const allIds = [primaryId, ...secondaryIds];
  const orders = await prisma.order.findMany({
    where: { id: { in: allIds }, userId },
  });

  if (orders.length !== allIds.length) {
    return res.status(404).json({ error: 'Eine oder mehrere Bestellungen nicht gefunden' });
  }

  const primary = orders.find(o => o.id === primaryId)!;
  const secondaries = orders.filter(o => o.id !== primaryId);

  // Felder der primären Bestellung auffüllen
  const patch: Record<string, unknown> = {};
  for (const sec of secondaries) {
    if (!primary.shop || primary.shop === 'Unbekannt') {
      if (sec.shop && sec.shop !== 'Unbekannt') patch.shop = sec.shop;
    }
    if (!primary.trackingNumber && sec.trackingNumber) patch.trackingNumber = sec.trackingNumber;
    if (!primary.carrier && sec.carrier)               patch.carrier = sec.carrier;
    if (!primary.price && sec.price)                   patch.price = sec.price;
    if (!primary.currency && sec.currency)             patch.currency = sec.currency;
    if (!primary.orderNumber && sec.orderNumber)       patch.orderNumber = sec.orderNumber;
    if (!primary.estimatedDelivery && sec.estimatedDelivery) patch.estimatedDelivery = sec.estimatedDelivery;
    if (!primary.deliveryAddress && sec.deliveryAddress)     patch.deliveryAddress = sec.deliveryAddress;
    if (!primary.emailStatus && sec.emailStatus)       patch.emailStatus = sec.emailStatus;
    if (!primary.emailBody && sec.emailBody)           patch.emailBody = sec.emailBody;
    if (!primary.emailBodyHtml && sec.emailBodyHtml)   patch.emailBodyHtml = sec.emailBodyHtml;
    if (!primary.orderDate && sec.orderDate)           patch.orderDate = sec.orderDate;
  }

  // Status neu ableiten
  const finalTracking    = (patch.trackingNumber as string | null) ?? primary.trackingNumber;
  const finalEmailStatus = (patch.emailStatus    as string | null) ?? primary.emailStatus;
  const finalAddress     = (patch.deliveryAddress as string | null) ?? primary.deliveryAddress;
  patch.status = deriveStatusForDedup(finalTracking, finalEmailStatus, finalAddress, primary.status);

  await prisma.$transaction(async (tx) => {
    if (Object.keys(patch).length > 0) {
      await tx.order.update({ where: { id: primaryId }, data: patch });
    }
    for (const sec of secondaries) {
      await tx.orderEmail.updateMany({ where: { orderId: sec.id }, data: { orderId: primaryId } });
      await tx.orderAttachment.updateMany({ where: { orderId: sec.id }, data: { orderId: primaryId } });
      await tx.trackingEvent.updateMany({ where: { orderId: sec.id }, data: { orderId: primaryId } });
      await tx.order.delete({ where: { id: sec.id } });
    }
  });

  const merged = await prisma.order.findUnique({
    where: { id: primaryId },
    include: {
      trackingEvents: { orderBy: { timestamp: 'desc' } },
      emailAccount:   { select: { email: true, provider: true } },
      orderEmails:    { orderBy: { receivedAt: 'asc' } },
    },
  });

  return res.json(merged);
});

// POST /api/orders/:id/split
// Trennt ausgewählte E-Mails aus einer Bestellung heraus und erstellt pro E-Mail
// eine neue Bestellung aus den gespeicherten GPT-Daten.
// Body: { emailIds: string[] }
router.post('/:id/split', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const userId  = String(req.user!.id);
  const orderId = String(req.params.id);
  const { emailIds } = req.body as { emailIds?: string[] };

  if (!Array.isArray(emailIds) || emailIds.length === 0) {
    return res.status(400).json({ error: 'emailIds darf nicht leer sein' });
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { orderEmails: true },
  });
  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden' });

  const emailsToSplit = order.orderEmails.filter(e => emailIds.includes(e.id));
  if (emailsToSplit.length === 0) {
    return res.status(404).json({ error: 'Keine der angegebenen E-Mails gefunden' });
  }

  // Sicherstellen, dass mindestens eine E-Mail in der Originalbestellung verbleibt
  const remainingCount = order.orderEmails.length - emailsToSplit.length;
  if (remainingCount < 1) {
    return res.status(400).json({ error: 'Mindestens eine E-Mail muss in der Bestellung verbleiben' });
  }

  const newOrders = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const em of emailsToSplit) {
      // Neue Bestellung aus GPT-Daten der Email erzeugen
      const newOrder = await tx.order.create({
        data: {
          userId,
          emailAccountId: order.emailAccountId,
          shop:             em.gptShop             || order.shop || 'Unbekannt',
          orderNumber:      em.gptOrderNumber      ?? null,
          trackingNumber:   em.gptTrackingNumber   ?? null,
          carrier:          em.gptCarrier          ?? null,
          price:            em.gptPrice            ?? null,
          currency:         em.gptCurrency         ?? order.currency ?? 'EUR',
          orderDate:        em.gptOrderDate        ?? em.receivedAt  ?? order.orderDate,
          estimatedDelivery: em.gptEstimatedDelivery ?? null,
          deliveryAddress:  em.gptDeliveryAddress  ?? null,
          emailStatus:      em.gptDeliveryStatus   ?? null,
          subject:          em.subject             ?? null,
          emailBody:        em.bodyText            ?? null,
          emailBodyHtml:    em.bodyHtml            ?? null,
          status: deriveStatusForDedup(
            em.gptTrackingNumber,
            em.gptDeliveryStatus,
            em.gptDeliveryAddress,
            'processing',
          ),
        },
      });

      // E-Mail zur neuen Bestellung verschieben
      await tx.orderEmail.update({
        where: { id: em.id },
        data:  { orderId: newOrder.id },
      });

      // Anhänge dieser Email zur neuen Bestellung können wir nicht eindeutig zuordnen,
      // da Anhänge an die Bestellung, nicht an einzelne E-Mails gebunden sind.
      // Anhänge verbleiben daher bei der Originalbestellung.

      created.push(newOrder);
    }
    return created;
  });

  // Originalbestellung mit aktualisierten Daten zurückgeben
  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      trackingEvents: { orderBy: { timestamp: 'desc' } },
      emailAccount:   { select: { email: true, provider: true } },
      orderEmails:    { orderBy: { receivedAt: 'asc' } },
    },
  });

  return res.json({ updatedOrder: updated, newOrders });
});

// GET /api/orders
router.get('/', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const userId = String(req.user!.id);
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { orderDate: 'desc' },
    include: {
      trackingEvents: {
        orderBy: { timestamp: 'desc' },
        take: 1,
      },
    },
  });

  return res.json(orders);
});

// GET /api/orders/:id
router.get('/:id', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const userId = String(req.user!.id);

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      trackingEvents: { orderBy: { timestamp: 'desc' } },
      emailAccount: { select: { email: true, provider: true } },
      orderEmails: { orderBy: { receivedAt: 'asc' } },
    },
  });

  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden' });

  return res.json(order);
});

// POST /api/orders/:id/refresh-tracking
router.post('/:id/refresh-tracking', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const userId = String(req.user!.id);

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
  });

  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden' });
  if (!order.trackingNumber) {
    return res.status(400).json({ error: 'Keine Sendungsnummer vorhanden' });
  }
  if (!order.carrier) {
    return res.status(400).json({ error: 'Kein Transportunternehmen bekannt – Tracking nicht möglich' });
  }

  try {
    const result = await getTrackingInfo(order.trackingNumber, order.carrier || undefined);
    const uniqueEvents = dedupeEvents(result.events);

    await prisma.$transaction(async (tx) => {
      await tx.trackingEvent.deleteMany({ where: { orderId: order.id } });
      if (uniqueEvents.length > 0) {
        await tx.trackingEvent.createMany({
          data: uniqueEvents.map((event) => ({
            orderId: order.id,
            timestamp: event.timestamp,
            location: event.location,
            status: event.status,
            description: event.description,
          })),
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: result.status,
          estimatedDelivery: result.estimatedDelivery || order.estimatedDelivery,
        },
      });
    });

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { trackingEvents: { orderBy: { timestamp: 'desc' } } },
    });

    return res.json(updatedOrder);
  } catch (err) {
    if (err instanceof TrackingProviderError) {
      const statusCode = err.type === 'not_found' ? 404 : err.type === 'auth' ? 502 : 503;
      return res.status(statusCode).json({
        error: 'Tracking-Aktualisierung fehlgeschlagen',
        provider: err.provider,
        type: err.type,
        detail: err.message,
      });
    }
    console.error(err);
    return res.status(500).json({ error: 'Tracking-Aktualisierung fehlgeschlagen' });
  }
});

// PATCH /api/orders/:id  – Sendungsnummer, Spediteur und Status manuell setzen
router.patch('/:id', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const userId  = String(req.user!.id);

  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden' });

  const allowed = ['trackingNumber', 'carrier', 'status'] as const;
  const patch: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in req.body) {
      patch[key] = req.body[key] === '' ? null : String(req.body[key]);
    }
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Keine gültigen Felder angegeben' });
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: patch,
    include: {
      trackingEvents: { orderBy: { timestamp: 'desc' } },
      emailAccount: { select: { email: true, provider: true } },
    },
  });

  return res.json(updated);
});

// DELETE /api/orders/:id
router.delete('/:id', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const userId = String(req.user!.id);

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
  });

  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden' });

  await prisma.order.delete({ where: { id: order.id } });
  return res.json({ message: 'Bestellung gelöscht' });
});

export default router;
