"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_TRACKING_STATUSES = void 0;
exports.statusLabel = statusLabel;
exports.refreshOrderTracking = refreshOrderTracking;
const client_1 = require("@prisma/client");
const tracking_1 = require("../tracking");
const normalization_1 = require("./normalization");
const push_1 = require("../push");
const trackingmore_1 = require("./providers/trackingmore");
const prisma = new client_1.PrismaClient();
/** Status, bei denen Tracking im Hintergrund weiter abgefragt wird */
exports.ACTIVE_TRACKING_STATUSES = [
    'processing',
    'in transit',
    'in packstation',
    'unknown',
];
/** Menschlich lesbarer Text für einen Bestellstatus */
function statusLabel(status) {
    const map = {
        processing: 'In Bearbeitung',
        'in transit': 'Im Versand',
        'in packstation': 'In Packstation',
        delivered: 'Zugestellt',
    };
    return map[status] ?? status;
}
function buildStatusPushBody(shop, status) {
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
async function notifyStatusChange(userId, order, newStatus) {
    try {
        await (0, push_1.sendPushToUser)(userId, {
            title: `${order.shop}: ${statusLabel(newStatus)}`,
            body: buildStatusPushBody(order.shop, newStatus),
            url: `/orders/${order.id}`,
            tag: `order-${order.id}`,
            data: { orderId: order.id, status: newStatus },
        });
    }
    catch (err) {
        console.error('[tracking] Push-Versand fehlgeschlagen:', err.message);
    }
}
/**
 * Aktualisiert Tracking-Daten einer Bestellung und sendet optional eine Push-Benachrichtigung
 * bei Statusänderung.
 */
async function refreshOrderTracking(orderId, options = {}) {
    const { sendPush = true } = options;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.trackingNumber)
        return false;
    const result = await (0, tracking_1.getTrackingInfo)(order.trackingNumber);
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
                carrier: result.detectedCarrier ?? order.carrier,
            },
        });
    });
    if (sendPush && previousStatus !== result.status) {
        await notifyStatusChange(order.userId, order, result.status);
    }
    if (result.status === 'delivered' && previousStatus !== 'delivered') {
        void (0, trackingmore_1.deleteTrackingFromTrackingMore)(order.trackingNumber, {
            courierCode: result.courierCode,
            carrier: order.carrier,
        });
    }
    return true;
}
//# sourceMappingURL=refreshOrder.js.map