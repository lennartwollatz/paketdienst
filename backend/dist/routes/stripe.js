"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const ONE_TIME_PAYMENT_AMOUNT_CENTS = Number(process.env.ONE_TIME_PAYMENT_AMOUNT_CENTS || 1000);
const FREE_PROCESSED_ORDERS_LIMIT = Number(process.env.FREE_PROCESSED_ORDERS_LIMIT || 20);
function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key === 'sk_test_PLACEHOLDER') {
        return null;
    }
    return new stripe_1.default(key);
}
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
// POST /api/stripe/create-payment-intent
router.post('/create-payment-intent', auth_1.requireAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
        return res.status(503).json({ error: 'Stripe nicht konfiguriert. Bitte STRIPE_SECRET_KEY setzen.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user)
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { userId: user.id },
            });
            customerId = customer.id;
            await prisma.user.update({
                where: { id: user.id },
                data: { stripeCustomerId: customerId },
            });
        }
        const paymentIntent = await stripe.paymentIntents.create({
            amount: ONE_TIME_PAYMENT_AMOUNT_CENTS,
            currency: 'eur',
            customer: customerId,
            automatic_payment_methods: { enabled: true },
            metadata: {
                userId: user.id,
                type: 'one_time_unlock',
            },
        });
        return res.json({
            clientSecret: paymentIntent.client_secret,
            amountCents: ONE_TIME_PAYMENT_AMOUNT_CENTS,
            freeProcessedOrdersLimit: FREE_PROCESSED_ORDERS_LIMIT,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Fehler beim Erstellen des PaymentIntents' });
    }
});
// POST /api/stripe/confirm-one-time-payment
router.post('/confirm-one-time-payment', auth_1.requireAuth, async (req, res) => {
    try {
        const { paymentIntentId } = req.body;
        if (!paymentIntentId) {
            return res.status(400).json({ error: 'paymentIntentId fehlt' });
        }
        const stripe = getStripe();
        const isMock = paymentIntentId.startsWith('mock_pi_');
        if (!stripe && !isMock) {
            return res.status(503).json({ error: 'Stripe nicht konfiguriert.' });
        }
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, stripeCustomerId: true, isTestUser: true },
        });
        if (!user)
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        if (isMock) {
            if (!user.isTestUser && process.env.NODE_ENV === 'production') {
                return res.status(403).json({ error: 'Mock-Zahlung ist nur für Testnutzer erlaubt' });
            }
        }
        else {
            const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (intent.status !== 'succeeded') {
                return res.status(400).json({ error: 'Zahlung ist noch nicht abgeschlossen' });
            }
            if (user.stripeCustomerId && intent.customer && intent.customer !== user.stripeCustomerId) {
                return res.status(403).json({ error: 'PaymentIntent gehört zu einem anderen Kunden' });
            }
        }
        await prisma.user.update({
            where: { id: user.id },
            data: {
                hasPaymentMethod: true,
            },
        });
        return res.json({
            success: true,
            message: 'Einmalige Zahlung bestätigt',
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Fehler beim Bestätigen der Zahlung' });
    }
});
// GET /api/stripe/status
router.get('/status', auth_1.requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            hasPaymentMethod: true,
            isTestUser: true,
            stripeCustomerId: true,
        },
    });
    const orders = await prisma.order.findMany({
        where: { userId: req.user.id },
        select: { status: true },
    });
    const processedOrdersCount = orders.filter((order) => isProcessedOrderStatus(order.status)).length;
    const paymentRequired = !user?.isTestUser && !user?.hasPaymentMethod && processedOrdersCount >= FREE_PROCESSED_ORDERS_LIMIT;
    return res.json({
        hasPaymentMethod: user?.hasPaymentMethod || false,
        isTestUser: user?.isTestUser || false,
        stripeConfigured: !!getStripe(),
        processedOrdersCount,
        freeProcessedOrdersLimit: FREE_PROCESSED_ORDERS_LIMIT,
        paymentRequired,
        oneTimeAmountCents: ONE_TIME_PAYMENT_AMOUNT_CENTS,
    });
});
// POST /api/stripe/webhook
router.post('/webhook', async (req, res) => {
    const stripe = getStripe();
    if (!stripe)
        return res.sendStatus(200);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !webhookSecret || webhookSecret === 'whsec_PLACEHOLDER') {
        return res.sendStatus(200);
    }
    try {
        const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const customerId = paymentIntent.customer;
            const userId = paymentIntent.metadata?.userId;
            if (userId) {
                await prisma.user.update({
                    where: { id: userId },
                    data: { hasPaymentMethod: true },
                });
            }
            else if (customerId) {
                // Fallback falls kein userId-Metadatum gesetzt wurde
                await prisma.user.updateMany({
                    where: { stripeCustomerId: customerId },
                    data: { hasPaymentMethod: true },
                });
            }
        }
        if (event.type === 'payment_intent.payment_failed') {
            const paymentIntent = event.data.object;
            const customerId = paymentIntent.customer;
            await prisma.user.updateMany({
                where: { stripeCustomerId: customerId },
                data: {
                    hasPaymentMethod: false,
                },
            });
        }
        return res.sendStatus(200);
    }
    catch (err) {
        console.error('Webhook-Fehler:', err);
        return res.status(400).json({ error: 'Webhook-Verarbeitung fehlgeschlagen' });
    }
});
exports.default = router;
//# sourceMappingURL=stripe.js.map