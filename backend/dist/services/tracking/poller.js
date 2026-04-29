"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrackingPoller = startTrackingPoller;
const client_1 = require("@prisma/client");
const tracking_1 = require("../tracking");
const prisma = new client_1.PrismaClient();
const CLOSED_STATUSES = new Set(['Zugestellt', 'delivered']);
async function refreshOrderTracking(orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.trackingNumber)
        return;
    const result = await (0, tracking_1.getTrackingInfo)(order.trackingNumber, order.carrier || undefined);
    await prisma.$transaction(async (tx) => {
        await tx.trackingEvent.deleteMany({ where: { orderId } });
        if (result.events.length > 0) {
            await tx.trackingEvent.createMany({
                data: result.events.map((event) => ({
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
}
function startTrackingPoller() {
    const enabled = process.env.TRACKING_POLLING_ENABLED === 'true';
    if (!enabled)
        return;
    const intervalMs = Number(process.env.TRACKING_POLLING_INTERVAL_MS || 30 * 60 * 1000);
    setInterval(async () => {
        try {
            const openOrders = await prisma.order.findMany({
                where: {
                    trackingNumber: { not: null },
                    NOT: { status: { in: Array.from(CLOSED_STATUSES) } },
                },
                select: { id: true },
                take: 100,
            });
            for (const order of openOrders) {
                try {
                    await refreshOrderTracking(order.id);
                }
                catch (error) {
                    console.error(`Tracking-Polling Fehler für Order ${order.id}:`, error);
                }
            }
        }
        catch (error) {
            console.error('Tracking-Polling fehlgeschlagen:', error);
        }
    }, intervalMs);
}
//# sourceMappingURL=poller.js.map