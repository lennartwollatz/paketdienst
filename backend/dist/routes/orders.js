"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const tracking_1 = require("../services/tracking");
const normalization_1 = require("../services/tracking/normalization");
const types_1 = require("../services/tracking/types");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/orders
router.get('/', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const userId = String(req.user.id);
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
router.get('/:id', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const orderId = String(req.params.id);
    const userId = String(req.user.id);
    const order = await prisma.order.findFirst({
        where: { id: orderId, userId },
        include: {
            trackingEvents: { orderBy: { timestamp: 'desc' } },
            emailAccount: {
                select: { email: true, provider: true },
            },
        },
    });
    if (!order)
        return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    return res.json(order);
});
// POST /api/orders/:id/refresh-tracking
router.post('/:id/refresh-tracking', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const orderId = String(req.params.id);
    const userId = String(req.user.id);
    const order = await prisma.order.findFirst({
        where: { id: orderId, userId },
    });
    if (!order)
        return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    if (!order.trackingNumber) {
        return res.status(400).json({ error: 'Keine Sendungsnummer vorhanden' });
    }
    try {
        const result = await (0, tracking_1.getTrackingInfo)(order.trackingNumber, order.carrier || undefined);
        const uniqueEvents = (0, normalization_1.dedupeEvents)(result.events);
        await prisma.$transaction(async (tx) => {
            await tx.trackingEvent.deleteMany({ where: { orderId: order.id } });
            if (uniqueEvents.length > 0) {
                await tx.trackingEvent.createMany({
                    data: uniqueEvents.map((event) => ({
                        orderId: order.id,
                        timestamp: event.timestamp,
                        location: event.location,
                        status: event.status,
                        description: event.description,
                    })),
                });
            }
            await tx.order.update({
                where: { id: order.id },
                data: {
                    status: result.status,
                    estimatedDelivery: result.estimatedDelivery || order.estimatedDelivery,
                },
            });
        });
        const updatedOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { trackingEvents: { orderBy: { timestamp: 'desc' } } },
        });
        return res.json(updatedOrder);
    }
    catch (err) {
        if (err instanceof types_1.TrackingProviderError) {
            const statusCode = err.type === 'not_found' ? 404 : err.type === 'auth' ? 502 : 503;
            return res.status(statusCode).json({
                error: 'Tracking-Aktualisierung fehlgeschlagen',
                provider: err.provider,
                type: err.type,
                detail: err.message,
            });
        }
        console.error(err);
        return res.status(500).json({ error: 'Tracking-Aktualisierung fehlgeschlagen' });
    }
});
// DELETE /api/orders/:id
router.delete('/:id', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const orderId = String(req.params.id);
    const userId = String(req.user.id);
    const order = await prisma.order.findFirst({
        where: { id: orderId, userId },
    });
    if (!order)
        return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    await prisma.order.delete({ where: { id: order.id } });
    return res.json({ message: 'Bestellung gelöscht' });
});
exports.default = router;
//# sourceMappingURL=orders.js.map