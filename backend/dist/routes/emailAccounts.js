"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptPassword = decryptPassword;
exports.syncUserAccounts = syncUserAccounts;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const imap_1 = require("../services/imap");
const openai_1 = require("../services/openai");
const syncLock_1 = require("../services/syncLock");
const orders_1 = require("./orders");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/** Antwort, wenn ein Sync-Lock nicht erworben werden konnte. */
function syncLockResponse(res, reason) {
    if (reason === 'busy_user') {
        return res.status(409).json({
            error: 'Es läuft bereits ein Sync für deinen Account. Bitte warte, bis er abgeschlossen ist.',
            code: 'sync_in_progress',
        });
    }
    return res.status(503).json({
        error: `Aktuell synchronisieren bereits ${syncLock_1.MAX_PARALLEL_USERS} Nutzer gleichzeitig. Bitte versuche es in wenigen Minuten erneut.`,
        code: 'sync_capacity_reached',
    });
}
/** Liest aus einem imapflow-Fehler (inkl. AggregateError) eine lesbare Fehlermeldung */
function extractSyncError(err) {
    let codes = '';
    if (err instanceof Error) {
        codes = err.message || '';
        const extra = err;
        if (!codes && extra.code)
            codes = String(extra.code);
        // AggregateError: Unter-Fehler auswerten
        if (Array.isArray(extra.errors)) {
            const subCodes = extra.errors
                .map(e => String(e.code || e.message || '')).filter(Boolean);
            if (subCodes.length)
                codes = codes ? codes + ' ' + subCodes.join(' ') : subCodes.join(' ');
        }
    }
    else {
        codes = String(err);
    }
    if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(codes))
        return 'IMAP-Server nicht erreichbar – Port 993 wird wahrscheinlich durch eine Firewall blockiert.';
    if (/ENOTFOUND/i.test(codes))
        return 'IMAP-Server nicht gefunden – bitte Hostname prüfen.';
    if (/auth|login|credential|AUTHENTICATIONFAILED/i.test(codes))
        return 'Anmeldung fehlgeschlagen – Benutzername oder Passwort falsch.';
    if (/SSL|TLS|certificate/i.test(codes))
        return 'SSL/TLS-Fehler bei der IMAP-Verbindung.';
    return `Sync fehlgeschlagen${codes ? ': ' + codes : ''}.`;
}
// Einfache XOR-basierte Verschlüsselung für IMAP-Passwörter
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
/** Leere oder Platzhalter-Betreffs als null zurückgeben */
function normalizeSubject(subject) {
    if (!subject)
        return null;
    if (/^\(kein betreff\)$/i.test(subject.trim()))
        return null;
    return subject.trim() || null;
}
/**
 * Leitet den Bestellstatus aus Tracking-Nummer und E-Mail-Status ab.
 * Keine Tracking-Nummer → Bestellung wurde bereits geliefert oder ist digital.
 */
function deriveStatus(trackingNumber, emailStatus, deliveryAddress) {
    const delivered = /zugestellt|geliefert|delivered|angekommen|abgeholt/i;
    const inTransit = /unterwegs|versandt|shipped|on the way|in transit|ausgeliefert|im versand/i;
    const packstation = /packstation|paketstation|parcel.?locker|abholstation/i;
    if (emailStatus) {
        if (packstation.test(emailStatus))
            return 'in packstation';
        if (delivered.test(emailStatus))
            return 'delivered';
        if (inTransit.test(emailStatus))
            return 'in transit';
    }
    // Keine Tracking-Nummer oder keine Lieferadresse → Sendung liegt bereits vor
    if (!trackingNumber)
        return 'delivered';
    if (!deliveryAddress)
        return 'delivered';
    return 'processing';
}
/** Numerischer Rang für Bestellstatus – höher = fortgeschrittener */
const STATUS_RANK = {
    'processing': 1,
    'in transit': 2,
    'in packstation': 3,
    'delivered': 4,
};
/**
 * Gibt den emailStatus-String zurück, der den fortgeschritteneren Zustand beschreibt.
 * Sind beide null oder gleich fortgeschritten, wird b (neuerer) bevorzugt.
 */
function pickMostAdvancedEmailStatus(a, b) {
    if (!a && !b)
        return null;
    if (!a)
        return b ?? null;
    if (!b)
        return a;
    const rankA = STATUS_RANK[deriveStatus('x', a, 'x')] ?? 0;
    const rankB = STATUS_RANK[deriveStatus('x', b, 'x')] ?? 0;
    // Neuerer Status (b) gewinnt bei Gleichstand
    return rankA > rankB ? a : b;
}
/** Filtert E-Mails, die noch nicht verarbeitet wurden, und gibt ihre rawEmailIds zurück */
async function getUnprocessedEmails(emails, userId, accountId) {
    const result = [];
    for (const email of emails) {
        const rawEmailId = email.uid + '-' + accountId;
        const already = await prisma.processedEmail.findUnique({
            where: { userId_rawEmailId: { userId, rawEmailId } },
        });
        if (!already)
            result.push({ email, rawEmailId });
    }
    return result;
}
/** Baut den GPT-Daten-Block für einen OrderEmail-Datensatz */
function gptFields(orderInfo) {
    return {
        gptShop: orderInfo.shop ?? null,
        gptPrice: orderInfo.price ?? null,
        gptCarrier: orderInfo.carrier ?? null,
        gptTrackingNumber: orderInfo.trackingNumber ?? null,
        gptDeliveryStatus: orderInfo.deliveryStatus ?? null,
        gptOrderNumber: orderInfo.orderNumber ?? null,
        gptEstimatedDelivery: orderInfo.estimatedDelivery ? new Date(orderInfo.estimatedDelivery) : null,
        gptDeliveryAddress: orderInfo.deliveryAddress ?? null,
        gptCurrency: orderInfo.currency ?? null,
        gptOrderDate: orderInfo.orderDate ? new Date(orderInfo.orderDate) : null,
    };
}
/**
 * Speichert das Ergebnis einer E-Mail-Analyse:
 * - Markiert die E-Mail als verarbeitet
 * - Legt ggf. eine neue Bestellung an oder merged mit vorhandener
 * Gibt zurück: 'new' | 'merged' | 'skipped'
 */
async function applyOrderInfo(email, rawEmailId, orderInfo, userId, accountId) {
    // In ProcessedEmail eintragen (verhindert erneute Verarbeitung)
    await prisma.processedEmail.create({
        data: { userId, rawEmailId, isOrder: orderInfo.isOrder },
    });
    if (!orderInfo.isOrder)
        return 'skipped';
    // Bestellung mit gleicher Bestellnummer zusammenführen
    if (orderInfo.orderNumber) {
        const duplicate = await prisma.order.findFirst({
            where: { userId, orderNumber: orderInfo.orderNumber },
        });
        if (duplicate) {
            // Alle leeren Felder auffüllen; "Unbekannt"-Platzhalter beim Shop ersetzen
            const mergedShop = (duplicate.shop && duplicate.shop !== 'Unbekannt')
                ? duplicate.shop
                : (orderInfo.shop || duplicate.shop || 'Unbekannt');
            const mergedTracking = duplicate.trackingNumber ?? orderInfo.trackingNumber ?? null;
            const mergedCarrier = duplicate.carrier ?? orderInfo.carrier ?? null;
            const mergedPrice = duplicate.price ?? orderInfo.price ?? null;
            const mergedCurrency = duplicate.currency ?? orderInfo.currency ?? 'EUR';
            const mergedEstimatedDelivery = duplicate.estimatedDelivery
                ?? (orderInfo.estimatedDelivery ? new Date(orderInfo.estimatedDelivery) : null);
            const mergedDeliveryAddress = duplicate.deliveryAddress ?? orderInfo.deliveryAddress ?? null;
            const mergedOrderDate = duplicate.orderDate
                ?? (orderInfo.orderDate ? new Date(orderInfo.orderDate) : null);
            // Den fortgeschrittensten bekannten E-Mail-Status bevorzugen
            const mergedEmailStatus = pickMostAdvancedEmailStatus(orderInfo.deliveryStatus, duplicate.emailStatus);
            const mergedStatus = deriveStatus(mergedTracking, mergedEmailStatus, mergedDeliveryAddress);
            await prisma.order.update({
                where: { id: duplicate.id },
                data: {
                    shop: mergedShop,
                    trackingNumber: mergedTracking,
                    carrier: mergedCarrier,
                    price: mergedPrice,
                    currency: mergedCurrency,
                    estimatedDelivery: mergedEstimatedDelivery,
                    deliveryAddress: mergedDeliveryAddress,
                    orderDate: mergedOrderDate ?? undefined,
                    emailStatus: mergedEmailStatus,
                    status: mergedStatus,
                    emailBody: duplicate.emailBody ?? email.text ?? null,
                    emailBodyHtml: duplicate.emailBodyHtml ?? email.html ?? null,
                },
            });
            // E-Mail-Inhalt + GPT-Daten dieser zusammengeführten Mail speichern
            await prisma.orderEmail.create({
                data: {
                    orderId: duplicate.id,
                    subject: normalizeSubject(email.subject),
                    fromAddress: email.from,
                    receivedAt: email.date,
                    bodyText: email.text || null,
                    bodyHtml: email.html || null,
                    ...gptFields(orderInfo),
                },
            });
            for (const att of email.attachments) {
                await prisma.orderAttachment.create({
                    data: {
                        orderId: duplicate.id,
                        filename: att.filename,
                        mimeType: att.mimeType,
                        sizeBytes: att.sizeBytes || att.data.byteLength,
                        data: att.data,
                    },
                });
            }
            return 'merged';
        }
    }
    // Neue Bestellung anlegen
    const order = await prisma.order.create({
        data: {
            userId,
            emailAccountId: accountId,
            shop: orderInfo.shop || 'Unbekannt',
            orderNumber: orderInfo.orderNumber,
            trackingNumber: orderInfo.trackingNumber,
            carrier: orderInfo.carrier,
            price: orderInfo.price,
            currency: orderInfo.currency || 'EUR',
            status: deriveStatus(orderInfo.trackingNumber, orderInfo.deliveryStatus, orderInfo.deliveryAddress),
            orderDate: orderInfo.orderDate ? new Date(orderInfo.orderDate) : email.date,
            estimatedDelivery: orderInfo.estimatedDelivery ? new Date(orderInfo.estimatedDelivery) : null,
            deliveryAddress: orderInfo.deliveryAddress ?? null,
            emailStatus: orderInfo.deliveryStatus ?? null,
            subject: normalizeSubject(email.subject),
            emailBody: email.text || null,
            emailBodyHtml: email.html || null,
            rawEmailId,
            orderEmails: {
                create: {
                    subject: normalizeSubject(email.subject),
                    fromAddress: email.from,
                    receivedAt: email.date,
                    bodyText: email.text || null,
                    bodyHtml: email.html || null,
                    ...gptFields(orderInfo),
                },
            },
        },
    });
    for (const att of email.attachments) {
        await prisma.orderAttachment.create({
            data: {
                orderId: order.id,
                filename: att.filename,
                mimeType: att.mimeType,
                sizeBytes: att.sizeBytes || att.data.byteLength,
                data: att.data,
            },
        });
    }
    return 'new';
}
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
        const testResult = await (0, imap_1.testImapConnection)({ host: imapHost, port: imapPort, username, password });
        if (!testResult.success) {
            const isFirewallIssue = testResult.error?.includes('Firewall') || testResult.error?.includes('blockiert');
            return res.status(400).json({
                error: testResult.error || 'IMAP-Verbindung fehlgeschlagen',
                hint: isFirewallIssue ? imap_1.FIREWALL_HINT : testResult.hint,
            });
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
// Löscht das Konto inklusive aller zugehörigen Bestellungen und ProcessedEmail-Einträge.
// TrackingEvents, OrderAttachments und OrderEmails werden per Cascade automatisch entfernt.
router.delete('/:id', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const accountId = String(req.params.id);
    const userId = String(req.user.id);
    const account = await prisma.emailAccount.findFirst({
        where: { id: accountId, userId },
    });
    if (!account)
        return res.status(404).json({ error: 'Konto nicht gefunden' });
    const [, deletedOrders] = await prisma.$transaction([
        prisma.processedEmail.deleteMany({
            where: { userId, rawEmailId: { contains: accountId } },
        }),
        prisma.order.deleteMany({
            where: { userId, emailAccountId: accountId },
        }),
        prisma.emailAccount.delete({ where: { id: account.id } }),
    ]);
    return res.json({
        message: `Konto gelöscht (${deletedOrders.count} Bestellung${deletedOrders.count === 1 ? '' : 'en'} entfernt)`,
        deletedOrders: deletedOrders.count,
    });
});
// GET /api/email-accounts/:id/folders
// Verbindet sich per IMAP und gibt alle verfügbaren Ordner zurück
router.get('/:id/folders', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    try {
        const accountId = String(req.params.id);
        const userId = String(req.user.id);
        const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
        if (!account)
            return res.status(404).json({ error: 'Konto nicht gefunden' });
        const password = decryptPassword(account.passwordEncrypted);
        let blocked = [];
        try {
            blocked = JSON.parse(account.blockedFolders);
        }
        catch {
            blocked = [];
        }
        const folders = await (0, imap_1.listFolders)({ host: account.imapHost, port: account.imapPort, username: account.username, password }, blocked);
        return res.json({ folders, blockedFolders: blocked });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: extractSyncError(err) });
    }
});
// PATCH /api/email-accounts/:id
// Speichert die blockedFolders-Liste eines Kontos
router.patch('/:id', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    try {
        const accountId = String(req.params.id);
        const userId = String(req.user.id);
        const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
        if (!account)
            return res.status(404).json({ error: 'Konto nicht gefunden' });
        const schema = zod_1.z.object({
            blockedFolders: zod_1.z.array(zod_1.z.string()),
        });
        const { blockedFolders } = schema.parse(req.body);
        await prisma.emailAccount.update({
            where: { id: accountId },
            data: { blockedFolders: JSON.stringify(blockedFolders) },
        });
        return res.json({ success: true, blockedFolders });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Fehler beim Speichern der Ordnereinstellungen' });
    }
});
// POST /api/email-accounts/:id/sync
router.post('/:id/sync', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const accountId = String(req.params.id);
    const userId = String(req.user.id);
    const lock = (0, syncLock_1.tryAcquireSyncLock)(userId);
    if (!lock.ok)
        return syncLockResponse(res, lock.reason);
    try {
        const account = await prisma.emailAccount.findFirst({
            where: { id: accountId, userId },
        });
        if (!account)
            return res.status(404).json({ error: 'Konto nicht gefunden' });
        const password = decryptPassword(account.passwordEncrypted);
        let blockedFolders = [];
        try {
            blockedFolders = JSON.parse(account.blockedFolders);
        }
        catch {
            blockedFolders = [];
        }
        // Vollsync: letzte 2 Monate; Deltasync: seit letztem Sync (mit 1h Puffer)
        const isFirstSync = !account.lastSyncAt;
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        const fetchOptions = isFirstSync
            ? { sinceDate: twoMonthsAgo, blockedFolders }
            : { sinceDate: new Date(account.lastSyncAt.getTime() - 60 * 60 * 1000), blockedFolders };
        console.log(`Starte ${isFirstSync ? 'Vollsync (letzte 2 Monate)' : 'Deltasync'} für ${account.email}`);
        const emails = await (0, imap_1.fetchEmails)({ host: account.imapHost, port: account.imapPort, username: account.username, password }, fetchOptions);
        // 1. Nur unverarbeitete E-Mails herausfiltern
        const unprocessed = await getUnprocessedEmails(emails, userId, account.id);
        const processed = emails.length;
        let newOrders = 0;
        let mergedOrders = 0;
        if (unprocessed.length > 0) {
            // 2. Alle auf einmal via Batch API analysieren (spart 50 % Kosten)
            const analysisMap = await (0, openai_1.analyzeEmailsBatch)(unprocessed.map(u => u.email));
            // 3. Ergebnisse speichern
            for (const { email, rawEmailId } of unprocessed) {
                const orderInfo = analysisMap.get(email.uid) ?? { isOrder: false };
                const result = await applyOrderInfo(email, rawEmailId, orderInfo, userId, account.id);
                if (result === 'new')
                    newOrders++;
                if (result === 'merged')
                    mergedOrders++;
            }
        }
        await prisma.emailAccount.update({
            where: { id: account.id },
            data: { lastSyncAt: new Date() },
        });
        // Automatisch Duplikate zusammenführen
        const dedupCount = await (0, orders_1.deduplicateOrders)(userId);
        mergedOrders += dedupCount;
        return res.json({
            message: `Sync abgeschlossen: ${processed} E-Mails verarbeitet, ${newOrders} neue Bestellungen, ${mergedOrders} zusammengeführt.`,
            processed,
            newOrders,
            mergedOrders,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: extractSyncError(err) });
    }
    finally {
        lock.release();
    }
});
// POST /api/email-accounts/:id/resync
// Setzt alle verarbeiteten E-Mails zurück und startet einen kompletten Neusync
router.post('/:id/resync', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const accountId = String(req.params.id);
    const userId = String(req.user.id);
    const lock = (0, syncLock_1.tryAcquireSyncLock)(userId);
    if (!lock.ok)
        return syncLockResponse(res, lock.reason);
    try {
        const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
        if (!account)
            return res.status(404).json({ error: 'Konto nicht gefunden' });
        // 1. Alle ProcessedEmail-Einträge dieses Kontos löschen
        await prisma.processedEmail.deleteMany({
            where: { userId, rawEmailId: { contains: accountId } },
        });
        // 2. Alle Bestellungen dieses Kontos löschen
        await prisma.order.deleteMany({ where: { userId, emailAccountId: accountId } });
        // 3. lastSyncAt zurücksetzen → nächster Sync wird als Vollsync ausgeführt
        await prisma.emailAccount.update({
            where: { id: accountId },
            data: { lastSyncAt: null },
        });
        // 4. Vollsync der letzten 2 Monate sofort starten
        const password = decryptPassword(account.passwordEncrypted);
        let blockedFolders = [];
        try {
            blockedFolders = JSON.parse(account.blockedFolders);
        }
        catch {
            blockedFolders = [];
        }
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        const emails = await (0, imap_1.fetchEmails)({ host: account.imapHost, port: account.imapPort, username: account.username, password }, { sinceDate: twoMonthsAgo, blockedFolders });
        const unprocessed = await getUnprocessedEmails(emails, userId, accountId);
        let newOrders = 0;
        let mergedOrders = 0;
        if (unprocessed.length > 0) {
            const analysisMap = await (0, openai_1.analyzeEmailsBatch)(unprocessed.map(u => u.email));
            for (const { email, rawEmailId } of unprocessed) {
                const orderInfo = analysisMap.get(email.uid) ?? { isOrder: false };
                const result = await applyOrderInfo(email, rawEmailId, orderInfo, userId, accountId);
                if (result === 'new')
                    newOrders++;
                if (result === 'merged')
                    mergedOrders++;
            }
        }
        await prisma.emailAccount.update({ where: { id: accountId }, data: { lastSyncAt: new Date() } });
        const dedupCount = await (0, orders_1.deduplicateOrders)(userId);
        mergedOrders += dedupCount;
        return res.json({
            message: `Neusync abgeschlossen: ${emails.length} E-Mails verarbeitet, ${newOrders} Bestellungen gefunden.`,
            processed: emails.length,
            newOrders,
            mergedOrders,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: extractSyncError(err) });
    }
    finally {
        lock.release();
    }
});
// POST /api/email-accounts/sync-all
// Ablauf: 1) Alle Accounts abrufen  2) Alle E-Mails holen  3) Ein einziger Batch an GPT  4) Speichern
router.post('/sync-all', auth_1.requireAuth, auth_1.requirePayment, async (req, res) => {
    const userId = String(req.user.id);
    const lock = (0, syncLock_1.tryAcquireSyncLock)(userId);
    if (!lock.ok)
        return syncLockResponse(res, lock.reason);
    try {
        const accounts = await prisma.emailAccount.findMany({ where: { userId } });
        const accountEmailsList = await Promise.all(accounts.map(async (account) => {
            try {
                const password = decryptPassword(account.passwordEncrypted);
                let blockedFolders = [];
                try {
                    blockedFolders = JSON.parse(account.blockedFolders);
                }
                catch {
                    blockedFolders = [];
                }
                const isFirstSync = !account.lastSyncAt;
                const twoMonthsAgo = new Date();
                twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
                const fetchOptions = isFirstSync
                    ? { sinceDate: twoMonthsAgo, blockedFolders }
                    : { sinceDate: new Date(account.lastSyncAt.getTime() - 60 * 60 * 1000), blockedFolders };
                console.log(`[sync-all] ${isFirstSync ? 'Vollsync (letzte 2 Monate)' : 'Deltasync'} für ${account.email}`);
                const emails = await (0, imap_1.fetchEmails)({ host: account.imapHost, port: account.imapPort, username: account.username, password }, fetchOptions);
                return { account, emails };
            }
            catch (err) {
                console.error(`[sync-all] Fehler beim Abrufen von ${account.email}:`, err);
                return { account, emails: [], error: extractSyncError(err) };
            }
        }));
        const allUnprocessed = [];
        for (const { account, emails } of accountEmailsList) {
            const unprocessed = await getUnprocessedEmails(emails, userId, account.id);
            for (const u of unprocessed) {
                allUnprocessed.push({ ...u, accountId: account.id });
            }
        }
        // ── Phase 3: Einziger Batch-Request an GPT für alle E-Mails ───────────────
        const analysisMap = allUnprocessed.length > 0
            ? await (0, openai_1.analyzeEmailsBatch)(allUnprocessed.map(u => u.email))
            : new Map();
        console.log(`[sync-all] Batch abgeschlossen: ${analysisMap.size}/${allUnprocessed.length} Ergebnisse`);
        // ── Phase 4: Ergebnisse speichern & Accounts aktualisieren ─────────────────
        const counters = new Map();
        for (const { email, rawEmailId, accountId } of allUnprocessed) {
            const orderInfo = analysisMap.get(email.uid) ?? { isOrder: false };
            try {
                const result = await applyOrderInfo(email, rawEmailId, orderInfo, userId, accountId);
                if (!counters.has(accountId))
                    counters.set(accountId, { newOrders: 0, mergedOrders: 0 });
                const c = counters.get(accountId);
                if (result === 'new')
                    c.newOrders++;
                if (result === 'merged')
                    c.mergedOrders++;
            }
            catch (err) {
                console.error(`[sync-all] Fehler beim Speichern:`, err);
            }
        }
        const syncedAt = new Date();
        const results = [];
        for (const { account, error } of accountEmailsList) {
            if (error) {
                results.push({ accountId: account.id, email: account.email, error });
                continue;
            }
            await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncAt: syncedAt } });
            const c = counters.get(account.id) ?? { newOrders: 0, mergedOrders: 0 };
            results.push({ accountId: account.id, email: account.email, ...c });
        }
        await (0, orders_1.deduplicateOrders)(userId).catch(() => { });
        return res.json({ results });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: extractSyncError(err) });
    }
    finally {
        lock.release();
    }
});
/**
 * Führt einen Delta-Sync für alle E-Mail-Accounts eines Nutzers durch.
 * Wird vom automatischen stündlichen Poller aufgerufen.
 *
 * Wird automatisch übersprungen, wenn der Nutzer bereits einen Sync laufen
 * hat oder die globale Parallel-Grenze erreicht ist.
 */
async function syncUserAccounts(userId) {
    const lock = (0, syncLock_1.tryAcquireSyncLock)(userId);
    if (!lock.ok) {
        if (lock.reason === 'busy_user') {
            console.log(`[auto-sync] Nutzer ${userId} hat bereits einen laufenden Sync – übersprungen.`);
        }
        else {
            console.log(`[auto-sync] Globale Parallel-Grenze (${syncLock_1.MAX_PARALLEL_USERS}) erreicht – Nutzer ${userId} übersprungen.`);
        }
        return { newOrders: 0, mergedOrders: 0 };
    }
    try {
        return await runSyncForUser(userId);
    }
    finally {
        lock.release();
    }
}
async function runSyncForUser(userId) {
    const accounts = await prisma.emailAccount.findMany({ where: { userId } });
    if (accounts.length === 0)
        return { newOrders: 0, mergedOrders: 0 };
    const accountEmailsList = await Promise.all(accounts.map(async (account) => {
        try {
            const password = decryptPassword(account.passwordEncrypted);
            let blockedFolders = [];
            try {
                blockedFolders = JSON.parse(account.blockedFolders);
            }
            catch {
                blockedFolders = [];
            }
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
            // Ersten Sync: letzte 2 Monate; alle weiteren: echter Delta (mit 1h Überlappung)
            const sinceDate = account.lastSyncAt
                ? new Date(account.lastSyncAt.getTime() - 60 * 60 * 1000)
                : twoMonthsAgo;
            console.log(`[auto-sync] Delta-Sync ${account.email} seit ${sinceDate.toISOString()}`);
            const emails = await (0, imap_1.fetchEmails)({ host: account.imapHost, port: account.imapPort, username: account.username, password }, { sinceDate, blockedFolders });
            return { account, emails };
        }
        catch (err) {
            console.error(`[auto-sync] Fehler beim Abrufen von ${account.email}:`, extractSyncError(err));
            return { account, emails: [] };
        }
    }));
    const allUnprocessed = [];
    for (const { account, emails } of accountEmailsList) {
        const unprocessed = await getUnprocessedEmails(emails, userId, account.id);
        for (const u of unprocessed)
            allUnprocessed.push({ ...u, accountId: account.id });
    }
    if (allUnprocessed.length === 0) {
        // lastSyncAt trotzdem aktualisieren
        const syncedAt = new Date();
        for (const { account } of accountEmailsList) {
            await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncAt: syncedAt } });
        }
        console.log(`[auto-sync] Keine neuen E-Mails für Nutzer ${userId}`);
        return { newOrders: 0, mergedOrders: 0 };
    }
    console.log(`[auto-sync] ${allUnprocessed.length} neue E-Mails werden analysiert...`);
    const analysisMap = await (0, openai_1.analyzeEmailsBatch)(allUnprocessed.map(u => u.email));
    let newOrders = 0;
    let mergedOrders = 0;
    for (const { email, rawEmailId, accountId } of allUnprocessed) {
        const orderInfo = analysisMap.get(email.uid) ?? { isOrder: false };
        try {
            const result = await applyOrderInfo(email, rawEmailId, orderInfo, userId, accountId);
            if (result === 'new')
                newOrders++;
            if (result === 'merged')
                mergedOrders++;
        }
        catch (err) {
            console.error('[auto-sync] Fehler beim Speichern:', err);
        }
    }
    const syncedAt = new Date();
    for (const { account } of accountEmailsList) {
        await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncAt: syncedAt } });
    }
    await (0, orders_1.deduplicateOrders)(userId).catch(() => { });
    console.log(`[auto-sync] Nutzer ${userId}: ${newOrders} neue, ${mergedOrders} zusammengeführte Bestellungen`);
    return { newOrders, mergedOrders };
}
exports.default = router;
//# sourceMappingURL=emailAccounts.js.map