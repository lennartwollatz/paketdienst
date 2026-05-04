"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrackingPoller = startTrackingPoller;
const client_1 = require("@prisma/client");
const tracking_1 = require("../tracking");
const normalization_1 = require("./normalization");
const push_1 = require("../push");
const prisma = new client_1.PrismaClient();
// Nur Bestellungen im Versand werden stündlich aktualisiert
const POLL_STATUSES = ['in transit'];
/** Menschlich lesbarer Text für einen Bestellstatus */
function statusLabel(status) {
    const map = {
        'processing': 'In Bearbeitung',
        'in transit': 'Unterwegs',
        'in packstation': 'In Packstation',
        'delivered': 'Zugestellt',
    };
    return map[status] ?? status;
}
async function refreshOrderTracking(orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.trackingNumber || !order.carrier)
        return;
    const result = await (0, tracking_1.getTrackingInfo)(order.trackingNumber, order.carrier);
    const uniqueEvents = (0, normalization_1.dedupeEvents)(result.events);
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
            await (0, push_1.sendPushToUser)(order.userId, {
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
        }
        catch (err) {
            console.error('[tracking-poller] Push-Versand fehlgeschlagen:', err.message);
        }
    }
}
async function runTrackingPoll() {
    const orders = await prisma.order.findMany({
        where: {
            trackingNumber: { not: null },
            carrier: { not: null },
            status: { in: POLL_STATUSES },
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
        }
        catch (err) {
            failed++;
            console.error(`[tracking-poller] Fehler bei Order ${order.id}:`, err.message);
        }
    }
    console.log(`[tracking-poller] Fertig: ${updated} aktualisiert, ${failed} Fehler.`);
}
function startTrackingPoller() {
    // Intervall: TRACKING_POLLING_INTERVAL_MS aus .env oder 1 Stunde
    const intervalMs = Number(process.env.TRACKING_POLLING_INTERVAL_MS || 60 * 60 * 1000);
    console.log(`[tracking-poller] Gestartet – Intervall: ${Math.round(intervalMs / 60000)} Minuten`);
    // Direkt beim Start einmal ausführen
    runTrackingPoll().catch((err) => console.error('[tracking-poller] Initialer Lauf fehlgeschlagen:', err));
    setInterval(() => {
        runTrackingPoll().catch((err) => console.error('[tracking-poller] Polling fehlgeschlagen:', err));
    }, intervalMs);
}
//# sourceMappingURL=poller.js.map