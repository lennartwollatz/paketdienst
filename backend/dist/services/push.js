"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPushService = initPushService;
exports.isPushConfigured = isPushConfigured;
exports.getVapidPublicKey = getVapidPublicKey;
exports.sendPushToUser = sendPushToUser;
const web_push_1 = __importDefault(require("web-push"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
let configured = false;
/**
 * Initialisiert web-push mit VAPID-Keys aus der Umgebung.
 * Liefert false zurück, wenn keine Keys gesetzt sind – Push-Versand wird dann übersprungen.
 */
function initPushService() {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';
    if (!publicKey || !privateKey) {
        console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nicht gesetzt – Push-Benachrichtigungen sind deaktiviert.');
        configured = false;
        return false;
    }
    web_push_1.default.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    console.log('[push] Web Push aktiviert.');
    return true;
}
function isPushConfigured() {
    return configured;
}
function getVapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}
/**
 * Sendet einen Push an alle registrierten Endpoints eines Nutzers.
 * Abgelaufene Subscriptions (404/410) werden automatisch entfernt.
 */
async function sendPushToUser(userId, payload) {
    if (!configured)
        return 0;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0)
        return 0;
    const json = JSON.stringify(payload);
    let delivered = 0;
    await Promise.all(subscriptions.map(async (sub) => {
        const target = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
            await web_push_1.default.sendNotification(target, json);
            delivered++;
        }
        catch (err) {
            const status = err?.statusCode;
            // 404/410 = Endpoint ist abgelaufen → aus DB entfernen
            if (status === 404 || status === 410) {
                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => { });
                console.log(`[push] Subscription ${sub.id} ist abgelaufen und wurde entfernt.`);
            }
            else {
                console.error(`[push] Versand an ${sub.endpoint} fehlgeschlagen:`, err.message);
            }
        }
    }));
    return delivered;
}
//# sourceMappingURL=push.js.map