import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getVapidPublicKey, isPushConfigured, sendPushToUser } from '../services/push';

const router = Router();
const prisma = new PrismaClient();

// GET /api/push/public-key
// Liefert den VAPID-Public-Key, den der Browser zum Anlegen einer Subscription benötigt.
router.get('/public-key', (_req, res: Response) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({ error: 'Push-Benachrichtigungen sind nicht konfiguriert.' });
  }
  return res.json({ publicKey });
});

// POST /api/push/subscribe
// Speichert eine vom Browser erzeugte PushSubscription für den eingeloggten Nutzer.
router.post('/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ error: 'Push-Benachrichtigungen sind nicht konfiguriert.' });
  }

  try {
    const schema = z.object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
      userAgent: z.string().optional(),
    });

    const { endpoint, keys, userAgent } = schema.parse(req.body);
    const userId = req.user!.id;

    // Existierende Subscription mit gleichem Endpoint übernehmen (z. B. wenn ein anderer
    // Nutzer am selben Browser angemeldet war oder Schlüssel rotiert wurden).
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });

    return res.status(201).json({ id: subscription.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    console.error('[push] subscribe-Fehler:', err);
    return res.status(500).json({ error: 'Fehler beim Speichern der Subscription' });
  }
});

// POST /api/push/unsubscribe
// Entfernt eine Subscription aus der DB (Browser-seitiges Unsubscribe macht das Frontend).
router.post('/unsubscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({ endpoint: z.string().url() });
    const { endpoint } = schema.parse(req.body);
    const userId = req.user!.id;

    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    return res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    console.error('[push] unsubscribe-Fehler:', err);
    return res.status(500).json({ error: 'Fehler beim Entfernen der Subscription' });
  }
});

// POST /api/push/test
// Sendet eine Testnachricht an alle Subscriptions des eingeloggten Nutzers.
router.post('/test', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ error: 'Push-Benachrichtigungen sind nicht konfiguriert.' });
  }
  const userId = req.user!.id;
  const delivered = await sendPushToUser(userId, {
    title: 'Paketdienst – Testnachricht',
    body: 'Benachrichtigungen sind aktiv.',
    tag: 'paketdienst-test',
    url: '/',
  });
  return res.json({ delivered });
});

export default router;
