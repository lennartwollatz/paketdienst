"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const imap_1 = require("../services/imap");
const openai_1 = require("../services/openai");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Einfache XOR-basierte Verschlüsselung für IMAP-Passwörter (für Produktion: AES verwenden)
function encryptPassword(password) {
    const key = process.env.JWT_SECRET || 'default-key';
    let result = '';
    for (let i = 0; i < password.length; i++) {
        result += String.fromCharCode(password.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(result).toString('base64');
}
function decryptPassword(encrypted) {
    const key = process.env.JWT_SECRET || 'default-key';
    const decoded = Buffer.from(encrypted, 'base64').toString();
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}
const PROVIDER_DEFAULTS = {
    gmail: { host: 'imap.gmail.com', port: 993 },
    outlook: { host: 'outlook.office365.com', port: 993 },
    hotmail: { host: 'outlook.office365.com', port: 993 },
    yahoo: { host: 'imap.mail.yahoo.com', port: 993 },
    icloud: { host: 'imap.mail.me.com', port: 993 },
    gmx: { host: 'imap.gmx.net', port: 993 },
    web_de: { host: 'imap.web.de', port: 993 },
    freenet: { host: 'mx.freenet.de', port: 993 },
};
// GET /api/email-accounts
router.get('/', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const accounts = await prisma.emailAccount.findMany({
        where: { userId: req.user.id },
        select: {
            id: true, provider: true, email: true, imapHost: true,
            imapPort: true, username: true, lastSyncAt: true, createdAt: true,
        },
    });
    return res.json(accounts);
});
// POST /api/email-accounts
router.post('/', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    try {
        const schema = zod_1.z.object({
            provider: zod_1.z.string().min(1),
            email: zod_1.z.string().email(),
            imapHost: zod_1.z.string().min(1),
            imapPort: zod_1.z.number().int().min(1).max(65535),
            username: zod_1.z.string().min(1),
            password: zod_1.z.string().min(1),
        });
        const { provider, email, imapHost, imapPort, username, password } = schema.parse(req.body);
        // Verbindung testen
        const connected = await (0, imap_1.testImapConnection)({ host: imapHost, port: imapPort, username, password });
        if (!connected) {
            return res.status(400).json({ error: 'IMAP-Verbindung fehlgeschlagen. Bitte überprüfe die Zugangsdaten.' });
        }
        const passwordEncrypted = encryptPassword(password);
        const account = await prisma.emailAccount.create({
            data: { userId: req.user.id, provider, email, imapHost, imapPort, username, passwordEncrypted },
        });
        return res.status(201).json({
            id: account.id, provider, email, imapHost, imapPort, username,
            lastSyncAt: account.lastSyncAt, createdAt: account.createdAt,
        });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Fehler beim Hinzufügen des E-Mail-Kontos' });
    }
});
// GET /api/email-accounts/providers
router.get('/providers', auth_1.requireAuth, (_req, res) => {
    return res.json(PROVIDER_DEFAULTS);
});
// DELETE /api/email-accounts/:id
router.delete('/:id', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const accountId = String(req.params.id);
    const userId = String(req.user.id);
    const account = await prisma.emailAccount.findFirst({
        where: { id: accountId, userId },
    });
    if (!account)
        return res.status(404).json({ error: 'Konto nicht gefunden' });
    await prisma.emailAccount.delete({ where: { id: account.id } });
    return res.json({ message: 'Konto gelöscht' });
});
// POST /api/email-accounts/:id/sync
router.post('/:id/sync', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    try {
        const accountId = String(req.params.id);
        const userId = String(req.user.id);
        const account = await prisma.emailAccount.findFirst({
            where: { id: accountId, userId },
        });
        if (!account)
            return res.status(404).json({ error: 'Konto nicht gefunden' });
        const password = decryptPassword(account.passwordEncrypted);
        const emails = await (0, imap_1.fetchEmails)({
            host: account.imapHost,
            port: account.imapPort,
            username: account.username,
            password,
        }, 100);
        let newOrders = 0;
        let processed = 0;
        for (const email of emails) {
            processed++;
            // Bereits analysierte E-Mails überspringen
            const existing = await prisma.order.findFirst({
                where: { userId: req.user.id, rawEmailId: { equals: email.uid + '-' + account.id } },
            });
            if (existing)
                continue;
            const orderInfo = await (0, openai_1.analyzeEmailForOrder)(email);
            if (orderInfo.isOrder) {
                await prisma.order.create({
                    data: {
                        userId: req.user.id,
                        emailAccountId: account.id,
                        shop: orderInfo.shop || 'Unbekannt',
                        orderNumber: orderInfo.orderNumber,
                        trackingNumber: orderInfo.trackingNumber,
                        carrier: orderInfo.carrier,
                        price: orderInfo.price,
                        currency: orderInfo.currency || 'EUR',
                        status: 'processing',
                        orderDate: orderInfo.orderDate ? new Date(orderInfo.orderDate) : email.date,
                        estimatedDelivery: orderInfo.estimatedDelivery ? new Date(orderInfo.estimatedDelivery) : null,
                        subject: email.subject,
                        rawEmailId: email.uid + '-' + account.id,
                    },
                });
                newOrders++;
            }
        }
        await prisma.emailAccount.update({
            where: { id: account.id },
            data: { lastSyncAt: new Date() },
        });
        return res.json({
            message: `Sync abgeschlossen: ${processed} E-Mails verarbeitet, ${newOrders} neue Bestellungen gefunden.`,
            processed,
            newOrders,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Sync fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler') });
    }
});
// POST /api/email-accounts/sync-all
router.post('/sync-all', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const accounts = await prisma.emailAccount.findMany({
        where: { userId: req.user.id },
    });
    const results = [];
    for (const account of accounts) {
        try {
            const password = decryptPassword(account.passwordEncrypted);
            const emails = await (0, imap_1.fetchEmails)({
                host: account.imapHost,
                port: account.imapPort,
                username: account.username,
                password,
            }, 50);
            let newOrders = 0;
            for (const email of emails) {
                const existing = await prisma.order.findFirst({
                    where: { userId: req.user.id, rawEmailId: { equals: email.uid + '-' + account.id } },
                });
                if (existing)
                    continue;
                const orderInfo = await (0, openai_1.analyzeEmailForOrder)(email);
                if (orderInfo.isOrder) {
                    await prisma.order.create({
                        data: {
                            userId: req.user.id,
                            emailAccountId: account.id,
                            shop: orderInfo.shop || 'Unbekannt',
                            orderNumber: orderInfo.orderNumber,
                            trackingNumber: orderInfo.trackingNumber,
                            carrier: orderInfo.carrier,
                            price: orderInfo.price,
                            currency: orderInfo.currency || 'EUR',
                            status: 'processing',
                            orderDate: orderInfo.orderDate ? new Date(orderInfo.orderDate) : email.date,
                            estimatedDelivery: orderInfo.estimatedDelivery ? new Date(orderInfo.estimatedDelivery) : null,
                            subject: email.subject,
                            rawEmailId: email.uid + '-' + account.id,
                        },
                    });
                    newOrders++;
                }
            }
            await prisma.emailAccount.update({
                where: { id: account.id },
                data: { lastSyncAt: new Date() },
            });
            results.push({ accountId: account.id, email: account.email, newOrders });
        }
        catch (err) {
            results.push({ accountId: account.id, email: account.email, error: String(err) });
        }
    }
    return res.json({ results });
});
exports.default = router;
//# sourceMappingURL=emailAccounts.js.map