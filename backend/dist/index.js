"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const auth_1 = __importDefault(require("./routes/auth"));
const emailAccounts_1 = __importDefault(require("./routes/emailAccounts"));
const orders_1 = __importDefault(require("./routes/orders"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const attachments_1 = __importDefault(require("./routes/attachments"));
const poller_1 = require("./services/tracking/poller");
const emailPoller_1 = require("./services/emailPoller");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
function isAllowedCorsOrigin(origin) {
    const allowedUrl = process.env.FRONTEND_URL?.trim();
    if (!allowedUrl)
        return false;
    if (origin === allowedUrl)
        return true;
    try {
        const requestOrigin = new URL(origin).origin;
        return requestOrigin === new URL(allowedUrl).origin;
    }
    catch {
        return false;
    }
}
// ── Sicherheits-Header ────────────────────────────────────────────────────────
app.use((_req, res, next) => {
    // Verhindert MIME-Type-Sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Verhindert Einbettung der App in fremde Frames (Clickjacking)
    res.setHeader('X-Frame-Options', 'DENY');
    // Aktiviert XSS-Filter älterer Browser
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Keine Referrer-Informationen an externe Seiten
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // CSP: API-Antworten dürfen nicht als Webseite ausgeführt werden
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    next();
});
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
            callback(null, true);
        }
        else if (isAllowedCorsOrigin(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('CORS: Nicht erlaubter Origin'));
        }
    },
    credentials: true,
}));
// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json());
app.use('/api/auth', auth_1.default);
app.use('/api/email-accounts', emailAccounts_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/stripe', stripe_1.default);
app.use('/api/attachments', attachments_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Interner Serverfehler', message: err.message });
});
/**
 * Einmalige Nachmigration: Erzeugt für jede Bestellung, die einen emailBody
 * besitzt aber noch keinen OrderEmail-Datensatz hat, einen synthetischen
 * OrderEmail-Eintrag aus den Legacy-Feldern.
 */
async function backfillOrderEmails() {
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { emailBody: { not: null } },
                { emailBodyHtml: { not: null } },
            ],
        },
        include: { orderEmails: { take: 1, select: { id: true } } },
    });
    let created = 0;
    for (const order of orders) {
        if (order.orderEmails.length === 0) {
            await prisma.orderEmail.create({
                data: {
                    orderId: order.id,
                    subject: order.subject ?? null,
                    fromAddress: null,
                    receivedAt: order.orderDate ?? order.createdAt,
                    bodyText: order.emailBody ?? null,
                    bodyHtml: order.emailBodyHtml ?? null,
                },
            });
            created++;
        }
    }
    if (created > 0) {
        console.log(`[migration] ${created} fehlende OrderEmail-Einträge nacherstellt.`);
    }
}
app.listen(PORT, async () => {
    console.log(`Server läuft auf Port ${PORT}`);
    await backfillOrderEmails();
    (0, poller_1.startTrackingPoller)();
    (0, emailPoller_1.startEmailPoller)();
});
exports.default = app;
//# sourceMappingURL=index.js.map