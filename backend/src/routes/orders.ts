import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requirePayment, AuthRequest } from '../middleware/auth';
import { refreshOrderTracking, scheduleOrderTrackingRefresh } from '../services/tracking/refreshOrder';
import { TrackingProviderError, trackingErrorStatusCode } from '../services/tracking/types';
import { isValidOrderCategory } from '../constants/orderCategories';
import { deleteTrackingFromTrackingMore } from '../services/tracking/providers/trackingmore';
import { applyShopCategoryAssignment, resolveOrderCategory } from '../services/shopCategory';

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

type OrderForDedup = Awaited<ReturnType<typeof prisma.order.findMany>>[number];

async function mergeOrderGroup(primary: OrderForDedup, duplicates: OrderForDedup[]): Promise<number> {
  if (duplicates.length === 0) return 0;

  const patch: Record<string, unknown> = {};

  for (const dup of duplicates) {
    if ((!primary.shop || primary.shop === 'Unbekannt') && dup.shop && dup.shop !== 'Unbekannt') {
      patch.shop = dup.shop;
    }
    if (!primary.orderNumber && dup.orderNumber) patch.orderNumber = dup.orderNumber;
    if (!primary.trackingNumber && dup.trackingNumber) patch.trackingNumber = dup.trackingNumber;
    if (!primary.carrier && dup.carrier) patch.carrier = dup.carrier;
    if (!primary.price && dup.price) patch.price = dup.price;
    if (!primary.estimatedDelivery && dup.estimatedDelivery) patch.estimatedDelivery = dup.estimatedDelivery;
    if (!primary.emailBody && dup.emailBody) patch.emailBody = dup.emailBody;
    if (!primary.emailBodyHtml && dup.emailBodyHtml) patch.emailBodyHtml = dup.emailBodyHtml;
    if (!primary.emailStatus && dup.emailStatus) patch.emailStatus = dup.emailStatus;
    if (!primary.deliveryAddress && dup.deliveryAddress) patch.deliveryAddress = dup.deliveryAddress;
    if (!primary.category && dup.category) patch.category = dup.category;
  }

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
  }

  return duplicates.length;
}

async function deduplicateByField(
  userId: string,
  field: 'orderNumber' | 'trackingNumber',
): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { userId, [field]: { not: null } },
    orderBy: { orderDate: 'asc' },
  });

  const groups = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = order[field]!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(order);
  }

  let mergedCount = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const [primary, ...duplicates] = group;
    mergedCount += await mergeOrderGroup(primary, duplicates);
  }
  return mergedCount;
}

/**
 * Fasst Bestellungen mit gleicher orderNumber oder trackingNumber eines Nutzers zusammen.
 * Wird automatisch nach jedem Sync aufgerufen.
 */
export async function deduplicateOrders(userId: string): Promise<number> {
  let mergedCount = 0;
  mergedCount += await deduplicateByField(userId, 'orderNumber');
  mergedCount += await deduplicateByField(userId, 'trackingNumber');
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
    if (!primary.category && sec.category)             patch.category = sec.category;
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
      const splitShop = em.gptShop || order.shop || 'Unbekannt';
      const splitCategory = await resolveOrderCategory(
        userId,
        splitShop,
        em.gptCategory ?? null,
      );
      // Neue Bestellung aus GPT-Daten der Email erzeugen
      const newOrder = await tx.order.create({
        data: {
          userId,
          emailAccountId: order.emailAccountId,
          shop:             splitShop,
          category:         splitCategory,
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

  if (!order) {
    return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'ORDER_NOT_FOUND' });
  }
  if (!order.trackingNumber) {
    return res.status(400).json({ error: 'Keine Sendungsnummer vorhanden' });
  }

  try {
    await refreshOrderTracking(order.id, { sendPush: true });

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { trackingEvents: { orderBy: { timestamp: 'desc' } } },
    });

    return res.json(updatedOrder);
  } catch (err) {
    if (err instanceof TrackingProviderError) {
      return res.status(trackingErrorStatusCode(err.type)).json({
        error: 'Tracking-Aktualisierung fehlgeschlagen',
        code: `TRACKING_${err.type.toUpperCase()}`,
        provider: err.provider,
        type: err.type,
        detail: err.message,
      });
    }
    console.error(err);
    return res.status(500).json({ error: 'Tracking-Aktualisierung fehlgeschlagen' });
  }
});

// PATCH /api/orders/:id  – Felder manuell setzen (Tracking, Kategorie, Preis, …)
router.patch('/:id', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const userId  = String(req.user!.id);

  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden' });

  const updateData: Record<string, string | null | boolean | number> = {};
  let hasFields = false;

  if ('trackingNumber' in req.body) {
    hasFields = true;
    updateData.trackingNumber = req.body.trackingNumber === '' ? null : String(req.body.trackingNumber);
  }
  if ('carrier' in req.body) {
    hasFields = true;
    updateData.carrier = req.body.carrier === '' ? null : String(req.body.carrier);
  }
  if ('status' in req.body) {
    hasFields = true;
    updateData.status = req.body.status === '' ? null : String(req.body.status);
  }
  if ('price' in req.body) {
    hasFields = true;
    const raw = req.body.price;
    if (raw === '' || raw == null) {
      updateData.price = null;
    } else {
      const price = typeof raw === 'number'
        ? raw
        : parseFloat(String(raw).trim().replace(',', '.'));
      if (Number.isNaN(price) || price < 0) {
        return res.status(400).json({ error: 'Ungültiger Preis' });
      }
      updateData.price = price;
    }
  }
  if ('currency' in req.body) {
    hasFields = true;
    const cur = req.body.currency === '' || req.body.currency == null
      ? null
      : String(req.body.currency).trim().toUpperCase();
    updateData.currency = cur;
  }

  let categoriesPropagated = 0;
  const categoryTouched = 'category' in req.body;
  let categoryValue: string | null | undefined;

  if (categoryTouched) {
    hasFields = true;
    const raw = req.body.category === '' || req.body.category == null
      ? null
      : String(req.body.category);
    if (raw !== null && !isValidOrderCategory(raw)) {
      return res.status(400).json({ error: 'Ungültige Kategorie' });
    }
    categoryValue = raw;
    updateData.category = raw;
  }

  if (!hasFields) {
    return res.status(400).json({ error: 'Keine gültigen Felder angegeben' });
  }

  const categoryChanged = categoryTouched
    && (categoryValue ?? null) !== (order.category ?? null);

  if (categoryChanged) {
    updateData.categoryManual = true;
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
    include: {
      trackingEvents: { orderBy: { timestamp: 'desc' } },
      emailAccount: { select: { email: true, provider: true } },
      orderEmails: { orderBy: { receivedAt: 'asc' } },
    },
  });

  if (categoryChanged) {
    categoriesPropagated = await applyShopCategoryAssignment(
      userId,
      order.shop,
      categoryValue ?? null,
      orderId,
    );
  }

  const newStatus = (updateData.status as string | undefined) ?? order.status;
  const trackingNumber = (updateData.trackingNumber as string | null | undefined) ?? order.trackingNumber;
  if (
    newStatus === 'delivered'
    && order.status !== 'delivered'
    && trackingNumber
  ) {
    void deleteTrackingFromTrackingMore(trackingNumber, {
      carrier: (updateData.carrier as string | null | undefined) ?? order.carrier,
    });
  }

  const trackingChanged =
    'trackingNumber' in req.body
    && (updateData.trackingNumber as string | null | undefined) !== order.trackingNumber;
  const newTrackingNumber = trackingChanged
    ? (updateData.trackingNumber as string | null | undefined)
    : null;
  if (newTrackingNumber && newStatus !== 'delivered') {
    scheduleOrderTrackingRefresh(orderId);
  }

  return res.json({ ...updated, categoriesPropagated });
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
