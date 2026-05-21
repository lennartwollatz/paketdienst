import { PrismaClient } from '@prisma/client';
import { getTrackingInfo } from '../tracking';
import { dedupeEvents } from './normalization';
import { sendPushToUser } from '../push';
import { deleteTrackingFromTrackingMore } from './providers/trackingmore';

const prisma = new PrismaClient();

/** Status, bei denen Tracking im Hintergrund weiter abgefragt wird */
export const ACTIVE_TRACKING_STATUSES = [
  'processing',
  'in transit',
  'in packstation',
  'unknown',
] as const;

/** Menschlich lesbarer Text für einen Bestellstatus */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    processing:     'In Bearbeitung',
    'in transit':   'Im Versand',
    'in packstation': 'In Packstation',
    delivered:      'Zugestellt',
  };
  return map[status] ?? status;
}

function buildStatusPushBody(shop: string, status: string): string {
  if (status === 'delivered') {
    return `Deine Bestellung bei ${shop} wurde zugestellt.`;
  }
  if (status === 'in packstation') {
    return `Deine Bestellung bei ${shop} liegt in einer Packstation bereit.`;
  }
  if (status === 'in transit') {
    return `Deine Bestellung bei ${shop} ist unterwegs.`;
  }
  return `Status hat sich auf „${statusLabel(status)}“ geändert.`;
}

async function notifyStatusChange(
  userId: string,
  order: { id: string; shop: string },
  newStatus: string,
): Promise<void> {
  try {
    await sendPushToUser(userId, {
      title: `${order.shop}: ${statusLabel(newStatus)}`,
      body: buildStatusPushBody(order.shop, newStatus),
      url: `/orders/${order.id}`,
      tag: `order-${order.id}`,
      data: { orderId: order.id, status: newStatus },
    });
  } catch (err) {
    console.error('[tracking] Push-Versand fehlgeschlagen:', (err as Error).message);
  }
}

/**
 * Aktualisiert Tracking-Daten einer Bestellung und sendet optional eine Push-Benachrichtigung
 * bei Statusänderung.
 */
export async function refreshOrderTracking(
  orderId: string,
  options: { sendPush?: boolean } = {},
): Promise<boolean> {
  const { sendPush = true } = options;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.trackingNumber) return false;

  const result = await getTrackingInfo(order.trackingNumber);
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
        carrier: result.detectedCarrier ?? order.carrier,
      },
    });
  });

  if (sendPush && previousStatus !== result.status) {
    await notifyStatusChange(order.userId, order, result.status);
  }

  if (result.status === 'delivered' && previousStatus !== 'delivered') {
    void deleteTrackingFromTrackingMore(order.trackingNumber, {
      courierCode: result.courierCode,
      carrier: order.carrier,
    });
  }

  return true;
}
