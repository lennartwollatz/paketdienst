"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requirePayment = requirePayment;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const FREE_PROCESSED_ORDERS_LIMIT = Number(process.env.FREE_PROCESSED_ORDERS_LIMIT || 20);
function isProcessedOrderStatus(status) {
    if (!status)
        return false;
    const normalized = status.trim().toLowerCase();
    const processedStatuses = new Set([
        'zugestellt',
        'delivered',
        'returned',
        'zurückgesendet',
        'zurueckgesendet',
        'retourniert',
    ]);
    return processedStatuses.has(normalized);
}
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Nicht autorisiert' });
    }
    const token = authHeader.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                email: true,
                isTestUser: true,
                hasPaymentMethod: true,
                stripeSubscriptionId: true,
            },
        });
        if (!user) {
            return res.status(401).json({ error: 'Benutzer nicht gefunden' });
        }
        req.user = {
            id: user.id,
            email: user.email,
            isTestUser: user.isTestUser,
            hasPaymentMethod: user.hasPaymentMethod,
            stripeSubscriptionId: user.stripeSubscriptionId,
        };
        next();
    }
    catch {
        return res.status(401).json({ error: 'Ungültiges Token' });
    }
}
async function requirePayment(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Nicht autorisiert' });
    }
    if (req.user.isTestUser || req.user.hasPaymentMethod) {
        return next();
    }
    const orders = await prisma.order.findMany({
        where: { userId: req.user.id },
        select: { status: true },
    });
    const processedOrdersCount = orders.filter((order) => isProcessedOrderStatus(order.status)).length;
    if (processedOrdersCount < FREE_PROCESSED_ORDERS_LIMIT) {
        return next();
    }
    return res.status(402).json({
        error: 'Einmalige Zahlung von 10 EUR erforderlich',
        code: 'PAYMENT_REQUIRED',
        freeProcessedOrdersLimit: FREE_PROCESSED_ORDERS_LIMIT,
        processedOrdersCount,
    });
}
//# sourceMappingURL=auth.js.map