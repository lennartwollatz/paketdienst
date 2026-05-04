"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const push_1 = require("../services/push");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/push/public-key
// Liefert den VAPID-Public-Key, den der Browser zum Anlegen einer Subscription benötigt.
router.get('/public-key', (_req, res) => {
    const publicKey = (0, push_1.getVapidPublicKey)();
    if (!publicKey) {
        return res.status(503).json({ error: 'Push-Benachrichtigungen sind nicht konfiguriert.' });
    }
    return res.json({ publicKey });
});
// POST /api/push/subscribe
// Speichert eine vom Browser erzeugte PushSubscription für den eingeloggten Nutzer.
router.post('/subscribe', auth_1.requireAuth, async (req, res) => {
    if (!(0, push_1.isPushConfigured)()) {
        return res.status(503).json({ error: 'Push-Benachrichtigungen sind nicht konfiguriert.' });
    }
    try {
        const schema = zod_1.z.object({
            endpoint: zod_1.z.string().url(),
            keys: zod_1.z.object({
                p256dh: zod_1.z.string().min(1),
                auth: zod_1.z.string().min(1),
            }),
            userAgent: zod_1.z.string().optional(),
        });
        const { endpoint, keys, userAgent } = schema.parse(req.body);
        const userId = req.user.id;
        // Existierende Subscription mit gleichem Endpoint übernehmen (z. B. wenn ein anderer
        // Nutzer am selben Browser angemeldet war oder Schlüssel rotiert wurden).
        const subscription = await prisma.pushSubscription.upsert({
            where: { endpoint },
            create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
            update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
        });
        return res.status(201).json({ id: subscription.id });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[push] subscribe-Fehler:', err);
        return res.status(500).json({ error: 'Fehler beim Speichern der Subscription' });
    }
});
// POST /api/push/unsubscribe
// Entfernt eine Subscription aus der DB (Browser-seitiges Unsubscribe macht das Frontend).
router.post('/unsubscribe', auth_1.requireAuth, async (req, res) => {
    try {
        const schema = zod_1.z.object({ endpoint: zod_1.z.string().url() });
        const { endpoint } = schema.parse(req.body);
        const userId = req.user.id;
        await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
        return res.json({ success: true });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[push] unsubscribe-Fehler:', err);
        return res.status(500).json({ error: 'Fehler beim Entfernen der Subscription' });
    }
});
// POST /api/push/test
// Sendet eine Testnachricht an alle Subscriptions des eingeloggten Nutzers.
router.post('/test', auth_1.requireAuth, async (req, res) => {
    if (!(0, push_1.isPushConfigured)()) {
        return res.status(503).json({ error: 'Push-Benachrichtigungen sind nicht konfiguriert.' });
    }
    const userId = req.user.id;
    const delivered = await (0, push_1.sendPushToUser)(userId, {
        title: 'Paketdienst – Testnachricht',
        body: 'Benachrichtigungen sind aktiv.',
        tag: 'paketdienst-test',
        url: '/',
    });
    return res.json({ delivered });
});
exports.default = router;
//# sourceMappingURL=push.js.map