import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let configured = false;

/**
 * Initialisiert web-push mit VAPID-Keys aus der Umgebung.
 * Liefert false zurück, wenn keine Keys gesetzt sind – Push-Versand wird dann übersprungen.
 */
export function initPushService(): boolean {
  const publicKey  = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject    = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nicht gesetzt – Push-Benachrichtigungen sind deaktiviert.');
    configured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  console.log('[push] Web Push aktiviert.');
  return true;
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Optionaler Pfad innerhalb der App, wohin der Klick navigieren soll (z. B. /orders/abc) */
  url?: string;
  /** Optionales Tag, damit gleichartige Benachrichtigungen einander ersetzen */
  tag?: string;
  /** Optionale Daten, die an den Service Worker durchgereicht werden */
  data?: Record<string, unknown>;
}

/**
 * Sendet einen Push an alle registrierten Endpoints eines Nutzers.
 * Abgelaufene Subscriptions (404/410) werden automatisch entfernt.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configured) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return 0;

  const json = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const target: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(target, json);
        delivered++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404/410 = Endpoint ist abgelaufen → aus DB entfernen
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          console.log(`[push] Subscription ${sub.id} ist abgelaufen und wurde entfernt.`);
        } else {
          console.error(`[push] Versand an ${sub.endpoint} fehlgeschlagen:`, (err as Error).message);
        }
      }
    }),
  );

  return delivered;
}

/** Push-Benachrichtigung, wenn beim E-Mail-Sync eine neue Bestellung erkannt wurde. */
export async function notifyNewOrder(
  userId: string,
  order: {
    id: string;
    shop: string;
    orderNumber?: string | null;
    trackingNumber?: string | null;
  },
): Promise<void> {
  const shop = order.shop && order.shop !== 'Unbekannt' ? order.shop : 'Unbekannt';
  let body = `Eine neue Bestellung bei ${shop} wurde in deiner E-Mail erkannt.`;
  if (order.trackingNumber) {
    body = `Neue Bestellung bei ${shop} – Sendungsnummer ${order.trackingNumber}.`;
  } else if (order.orderNumber) {
    body = `Neue Bestellung bei ${shop} – Bestellnummer ${order.orderNumber}.`;
  }

  try {
    await sendPushToUser(userId, {
      title: `Neue Bestellung: ${shop}`,
      body,
      url: `/orders/${order.id}`,
      tag: `order-new-${order.id}`,
      data: { orderId: order.id, type: 'new_order' },
    });
  } catch (err) {
    console.error('[push] Neue-Bestellung-Benachrichtigung fehlgeschlagen:', (err as Error).message);
  }
}
