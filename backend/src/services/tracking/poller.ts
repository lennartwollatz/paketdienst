import { PrismaClient } from '@prisma/client';
import { getTrackingInfo } from '../tracking';
import { dedupeEvents } from './normalization';
import { sendPushToUser } from '../push';

const prisma = new PrismaClient();

// Nur Bestellungen im Versand werden stündlich aktualisiert
const POLL_STATUSES = ['in transit'];

/** Menschlich lesbarer Text für einen Bestellstatus */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    'processing':     'In Bearbeitung',
    'in transit':     'Unterwegs',
    'in packstation': 'In Packstation',
    'delivered':      'Zugestellt',
  };
  return map[status] ?? status;
}

async function refreshOrderTracking(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.trackingNumber || !order.carrier) return;

  const result = await getTrackingInfo(order.trackingNumber, order.carrier);
  const uniqueEvents = dedupeEvents(result.events);
  const previousStatus = order.status;

  await prisma.$transaction(async (tx) => {
    await tx.trackingEvent.deleteMany({ where: { orderId } });
    if (uniqueEvents.length > 0) {
      await tx.trackingEvent.createMany({
        data: uniqueEvents.map((event) => ({
          orderId,
          timestamp: event.timestamp,
          location: event.location,
          status: event.status,
          description: event.description,
        })),
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: result.status,
        estimatedDelivery: result.estimatedDelivery || order.estimatedDelivery,
      },
    });
  });

  // Push-Benachrichtigung bei Statuswechsel verschicken (Fehler nicht weiterwerfen,
  // damit das Polling-Ergebnis erhalten bleibt).
  if (previousStatus !== result.status) {
    try {
      await sendPushToUser(order.userId, {
        title: `${order.shop}: ${statusLabel(result.status)}`,
        body: result.status === 'delivered'
          ? `Deine Bestellung bei ${order.shop} wurde zugestellt.`
          : result.status === 'in packstation'
          ? `Deine Bestellung bei ${order.shop} liegt in einer Packstation bereit.`
          : `Status hat sich auf "${statusLabel(result.status)}" geändert.`,
        url: `/orders/${order.id}`,
        tag: `order-${order.id}`,
        data: { orderId: order.id, status: result.status },
      });
    } catch (err) {
      console.error('[tracking-poller] Push-Versand fehlgeschlagen:', (err as Error).message);
    }
  }
}

async function runTrackingPoll(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: {
      trackingNumber: { not: null },
      carrier:        { not: null },
      status:         { in: POLL_STATUSES },
    },
    select: { id: true, trackingNumber: true, carrier: true },
    take: 100,
  });

  if (orders.length === 0) {
    console.log('[tracking-poller] Keine Bestellungen im Versand – nichts zu tun.');
    return;
  }

  console.log(`[tracking-poller] Aktualisiere ${orders.length} Bestellung(en) im Versand...`);

  let updated = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      await refreshOrderTracking(order.id);
      updated++;
    } catch (err) {
      failed++;
      console.error(`[tracking-poller] Fehler bei Order ${order.id}:`, (err as Error).message);
    }
  }

  console.log(`[tracking-poller] Fertig: ${updated} aktualisiert, ${failed} Fehler.`);
}

export function startTrackingPoller(): void {
  // Intervall: TRACKING_POLLING_INTERVAL_MS aus .env oder 1 Stunde
  const intervalMs = Number(process.env.TRACKING_POLLING_INTERVAL_MS || 60 * 60 * 1000);

  console.log(`[tracking-poller] Gestartet – Intervall: ${Math.round(intervalMs / 60000)} Minuten`);

  // Direkt beim Start einmal ausführen
  runTrackingPoll().catch((err) => console.error('[tracking-poller] Initialer Lauf fehlgeschlagen:', err));

  setInterval(() => {
    runTrackingPoll().catch((err) => console.error('[tracking-poller] Polling fehlgeschlagen:', err));
  }, intervalMs);
}
