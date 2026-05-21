import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, requirePayment, AuthRequest } from '../middleware/auth';
import { fetchEmails, listFolders, testImapConnection, FIREWALL_HINT } from '../services/imap';
import { analyzeEmailsBatch, OrderInfo } from '../services/openai';
import {
  tryAcquireSyncLock,
  isUserSyncing,
  MAX_PARALLEL_USERS,
  LockReason,
} from '../services/syncLock';
import { deduplicateOrders } from './orders';
import { notifyNewOrder } from '../services/push';
import { runAccountSyncWithProgress } from '../services/accountSync';
import type { SyncProgressPayload } from '../services/syncProgress';
import { deleteTrackingFromTrackingMore } from '../services/tracking/providers/trackingmore';
import { resolveOrderCategory } from '../services/shopCategory';
import { inferOrderCategory } from '../services/orderCategoryInference';
import { scheduleOrderTrackingRefresh } from '../services/tracking/refreshOrder';

const router = Router();
const prisma = new PrismaClient();

/** Antwort, wenn ein Sync-Lock nicht erworben werden konnte. */
function syncLockResponse(res: Response, reason: LockReason) {
  if (reason === 'busy_user') {
    return res.status(409).json({
      error: 'Es läuft bereits ein Sync für deinen Account. Bitte warte, bis er abgeschlossen ist.',
      code: 'sync_in_progress',
    });
  }
  return res.status(503).json({
    error: `Aktuell synchronisieren bereits ${MAX_PARALLEL_USERS} Nutzer gleichzeitig. Bitte versuche es in wenigen Minuten erneut.`,
    code: 'sync_capacity_reached',
  });
}

/** Liest aus einem imapflow-Fehler (inkl. AggregateError) eine lesbare Fehlermeldung */
function extractSyncError(err: unknown): string {
  let codes = '';
  if (err instanceof Error) {
    codes = err.message || '';
    const extra = err as unknown as Record<string, unknown>;
    if (!codes && extra.code) codes = String(extra.code);
    // AggregateError: Unter-Fehler auswerten
    if (Array.isArray(extra.errors)) {
      const subCodes = (extra.errors as Record<string, unknown>[])
        .map(e => String(e.code || e.message || '')).filter(Boolean);
      if (subCodes.length) codes = codes ? codes + ' ' + subCodes.join(' ') : subCodes.join(' ');
    }
  } else {
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
function encryptPassword(password: string): string {
  const key = process.env.JWT_SECRET || 'default-key';
  let result = '';
  for (let i = 0; i < password.length; i++) {
    result += String.fromCharCode(password.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result).toString('base64');
}

export function decryptPassword(encrypted: string): string {
  const key = process.env.JWT_SECRET || 'default-key';
  const decoded = Buffer.from(encrypted, 'base64').toString();
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

const PROVIDER_DEFAULTS: Record<string, { host: string; port: number }> = {
  gmail: { host: 'imap.gmail.com', port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
  hotmail: { host: 'outlook.office365.com', port: 993 },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993 },
  icloud: { host: 'imap.mail.me.com', port: 993 },
  gmx: { host: 'imap.gmx.net', port: 993 },
  web_de: { host: 'imap.web.de', port: 993 },
  freenet: { host: 'mx.freenet.de', port: 993 },
};

type EmailRecord = Awaited<ReturnType<typeof fetchEmails>>[number];

/** Leere oder Platzhalter-Betreffs als null zurückgeben */
function normalizeSubject(subject: string | undefined | null): string | null {
  if (!subject) return null;
  if (/^\(kein betreff\)$/i.test(subject.trim())) return null;
  return subject.trim() || null;
}

/**
 * Leitet den Bestellstatus aus Tracking-Nummer und E-Mail-Status ab.
 * Keine Tracking-Nummer → Bestellung wurde bereits geliefert oder ist digital.
 */
function deriveStatus(
  trackingNumber: string | null | undefined,
  emailStatus: string | null | undefined,
  deliveryAddress?: string | null,
): string {
  const delivered    = /zugestellt|geliefert|delivered|angekommen|abgeholt/i;
  const inTransit    = /unterwegs|versandt|shipped|on the way|in transit|ausgeliefert|im versand/i;
  const packstation  = /packstation|paketstation|parcel.?locker|abholstation/i;

  if (emailStatus) {
    if (packstation.test(emailStatus)) return 'in packstation';
    if (delivered.test(emailStatus))   return 'delivered';
    if (inTransit.test(emailStatus))   return 'in transit';
  }
  // Keine Tracking-Nummer oder keine Lieferadresse → Sendung liegt bereits vor
  if (!trackingNumber) return 'delivered';
  if (!deliveryAddress) return 'delivered';
  return 'processing';
}

/** Numerischer Rang für Bestellstatus – höher = fortgeschrittener */
const STATUS_RANK: Record<string, number> = {
  'processing':     1,
  'in transit':     2,
  'in packstation': 3,
  'delivered':      4,
};

/**
 * Gibt den emailStatus-String zurück, der den fortgeschritteneren Zustand beschreibt.
 * Sind beide null oder gleich fortgeschritten, wird b (neuerer) bevorzugt.
 */
function pickMostAdvancedEmailStatus(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  const rankA = STATUS_RANK[deriveStatus('x', a, 'x')] ?? 0;
  const rankB = STATUS_RANK[deriveStatus('x', b, 'x')] ?? 0;
  // Neuerer Status (b) gewinnt bei Gleichstand
  return rankA > rankB ? a : b;
}

/** Filtert E-Mails, die noch nicht verarbeitet wurden, und gibt ihre rawEmailIds zurück */
async function getUnprocessedEmails(
  emails: EmailRecord[],
  userId: string,
  accountId: string,
): Promise<{ email: EmailRecord; rawEmailId: string }[]> {
  const result: { email: EmailRecord; rawEmailId: string }[] = [];
  for (const email of emails) {
    const rawEmailId = email.uid + '-' + accountId;
    const already = await prisma.processedEmail.findUnique({
      where: { userId_rawEmailId: { userId, rawEmailId } },
    });
    if (!already) result.push({ email, rawEmailId });
  }
  return result;
}

/** Sucht eine vorhandene Bestellung per Bestell- oder Sendungsnummer (Bestellnummer zuerst). */
async function findExistingOrder(userId: string, orderInfo: OrderInfo) {
  if (orderInfo.orderNumber) {
    const byOrderNumber = await prisma.order.findFirst({
      where: { userId, orderNumber: orderInfo.orderNumber },
      orderBy: { orderDate: 'asc' },
    });
    if (byOrderNumber) return byOrderNumber;
  }

  if (orderInfo.trackingNumber) {
    return prisma.order.findFirst({
      where: { userId, trackingNumber: orderInfo.trackingNumber },
      orderBy: { orderDate: 'asc' },
    });
  }

  return null;
}

/** Kategorie aus GPT oder regelbasiertem Fallback (nur wenn zuordenbar). */
function categoryFromAnalysis(orderInfo: OrderInfo, email: EmailRecord): string | null {
  return orderInfo.category
    ?? inferOrderCategory(orderInfo.shop, email.subject, email.text)
    ?? null;
}

/** Baut den GPT-Daten-Block für einen OrderEmail-Datensatz */
function gptFields(orderInfo: OrderInfo, email: EmailRecord) {
  return {
    gptShop:              orderInfo.shop              ?? null,
    gptPrice:             orderInfo.price             ?? null,
    gptCarrier:           orderInfo.carrier           ?? null,
    gptTrackingNumber:    orderInfo.trackingNumber    ?? null,
    gptDeliveryStatus:    orderInfo.deliveryStatus    ?? null,
    gptOrderNumber:       orderInfo.orderNumber       ?? null,
    gptEstimatedDelivery: orderInfo.estimatedDelivery ? new Date(orderInfo.estimatedDelivery) : null,
    gptDeliveryAddress:   orderInfo.deliveryAddress   ?? null,
    gptCurrency:          orderInfo.currency          ?? null,
    gptOrderDate:         orderInfo.orderDate         ? new Date(orderInfo.orderDate) : null,
    gptCategory:          categoryFromAnalysis(orderInfo, email),
  };
}

/**
 * Speichert das Ergebnis einer E-Mail-Analyse:
 * - Markiert die E-Mail als verarbeitet
 * - Legt ggf. eine neue Bestellung an oder merged mit vorhandener
 * Gibt zurück: 'new' | 'merged' | 'skipped'
 */
async function applyOrderInfo(
  email: EmailRecord,
  rawEmailId: string,
  orderInfo: OrderInfo,
  userId: string,
  accountId: string,
): Promise<'new' | 'merged' | 'skipped'> {
  // In ProcessedEmail eintragen (verhindert erneute Verarbeitung)
  await prisma.processedEmail.create({
    data: { userId, rawEmailId, isOrder: orderInfo.isOrder },
  });

  if (!orderInfo.isOrder) return 'skipped';

  // Bestellung mit gleicher Bestell- oder Sendungsnummer zusammenführen
  const duplicate = await findExistingOrder(userId, orderInfo);

  if (duplicate) {
    // Alle leeren Felder auffüllen; "Unbekannt"-Platzhalter beim Shop ersetzen
    const mergedShop = (duplicate.shop && duplicate.shop !== 'Unbekannt')
      ? duplicate.shop
      : (orderInfo.shop || duplicate.shop || 'Unbekannt');
    const mergedOrderNumber = duplicate.orderNumber ?? orderInfo.orderNumber ?? null;
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
    const mergedEmailStatus = pickMostAdvancedEmailStatus(
      orderInfo.deliveryStatus,
      duplicate.emailStatus,
    );
    const mergedStatus = deriveStatus(mergedTracking, mergedEmailStatus, mergedDeliveryAddress);
    const mergedShopForCategory = (duplicate.shop && duplicate.shop !== 'Unbekannt')
      ? duplicate.shop
      : (orderInfo.shop || duplicate.shop || 'Unbekannt');
    const mergedCategory = await resolveOrderCategory(
      userId,
      mergedShopForCategory,
      categoryFromAnalysis(orderInfo, email),
      { category: duplicate.category, categoryManual: duplicate.categoryManual },
    );

    await prisma.order.update({
      where: { id: duplicate.id },
      data: {
        shop:             mergedShop,
        category:         mergedCategory,
        orderNumber:      mergedOrderNumber,
        trackingNumber:   mergedTracking,
        carrier:          mergedCarrier,
        price:            mergedPrice,
        currency:         mergedCurrency,
        estimatedDelivery: mergedEstimatedDelivery,
        deliveryAddress:  mergedDeliveryAddress,
        orderDate:        mergedOrderDate ?? undefined,
        emailStatus:      mergedEmailStatus,
        status:           mergedStatus,
        emailBody:        duplicate.emailBody ?? email.text ?? null,
        emailBodyHtml:    duplicate.emailBodyHtml ?? email.html ?? null,
      },
    });

    // E-Mail-Inhalt + GPT-Daten dieser zusammengeführten Mail speichern
    await prisma.orderEmail.create({
      data: {
        orderId:    duplicate.id,
        subject:    normalizeSubject(email.subject),
        fromAddress: email.from,
        receivedAt: email.date,
        bodyText:   email.text || null,
        bodyHtml:   email.html ?? null,
        ...gptFields(orderInfo, email),
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

    if (mergedStatus === 'delivered' && mergedTracking && duplicate.status !== 'delivered') {
      void deleteTrackingFromTrackingMore(mergedTracking, { carrier: mergedCarrier });
    }

    const gainedTracking = !duplicate.trackingNumber && !!mergedTracking;
    if (gainedTracking && mergedStatus !== 'delivered') {
      scheduleOrderTrackingRefresh(duplicate.id);
    }

    return 'merged';
  }

  // Neue Bestellung anlegen
  const newShop = orderInfo.shop || 'Unbekannt';
  const newCategory = await resolveOrderCategory(
    userId,
    newShop,
    categoryFromAnalysis(orderInfo, email),
  );

  const order = await prisma.order.create({
    data: {
      userId,
      emailAccountId: accountId,
      shop: newShop,
      category: newCategory,
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
          subject:    normalizeSubject(email.subject),
          fromAddress: email.from,
          receivedAt: email.date,
          bodyText:   email.text || null,
          bodyHtml:   email.html || null,
          ...gptFields(orderInfo, email),
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

  if (order.status === 'delivered' && order.trackingNumber) {
    void deleteTrackingFromTrackingMore(order.trackingNumber, { carrier: order.carrier });
  }

  await notifyNewOrder(userId, {
    id: order.id,
    shop: order.shop,
    orderNumber: order.orderNumber,
    trackingNumber: order.trackingNumber,
  });

  if (order.trackingNumber && order.status !== 'delivered') {
    scheduleOrderTrackingRefresh(order.id);
  }

  return 'new';
}

// GET /api/email-accounts
router.get('/', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId: req.user!.id },
    select: {
      id: true, provider: true, email: true, imapHost: true,
      imapPort: true, username: true, lastSyncAt: true, createdAt: true,
    },
  });
  return res.json(accounts);
});

// POST /api/email-accounts
router.post('/', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      provider: z.string().min(1),
      email: z.string().email(),
      imapHost: z.string().min(1),
      imapPort: z.number().int().min(1).max(65535),
      username: z.string().min(1),
      password: z.string().min(1),
    });

    const { provider, email, imapHost, imapPort, username, password } = schema.parse(req.body);

    const testResult = await testImapConnection({ host: imapHost, port: imapPort, username, password });
    if (!testResult.success) {
      const isFirewallIssue = testResult.error?.includes('Firewall') || testResult.error?.includes('blockiert');
      return res.status(400).json({
        error: testResult.error || 'IMAP-Verbindung fehlgeschlagen',
        hint: isFirewallIssue ? FIREWALL_HINT : testResult.hint,
      });
    }

    const passwordEncrypted = encryptPassword(password);
    const account = await prisma.emailAccount.create({
      data: { userId: req.user!.id, provider, email, imapHost, imapPort, username, passwordEncrypted },
    });

    return res.status(201).json({
      id: account.id, provider, email, imapHost, imapPort, username,
      lastSyncAt: account.lastSyncAt, createdAt: account.createdAt,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Fehler beim Hinzufügen des E-Mail-Kontos' });
  }
});

// GET /api/email-accounts/providers
router.get('/providers', requireAuth, (_req: AuthRequest, res: Response) => {
  return res.json(PROVIDER_DEFAULTS);
});

// DELETE /api/email-accounts/:id
// Löscht das Konto inklusive aller zugehörigen Bestellungen und ProcessedEmail-Einträge.
// TrackingEvents, OrderAttachments und OrderEmails werden per Cascade automatisch entfernt.
router.delete('/:id', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const accountId = String(req.params.id);
  const userId = String(req.user!.id);

  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, userId },
  });

  if (!account) return res.status(404).json({ error: 'Konto nicht gefunden' });

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
router.get('/:id/folders', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = String(req.params.id);
    const userId = String(req.user!.id);

    const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) return res.status(404).json({ error: 'Konto nicht gefunden' });

    const password = decryptPassword(account.passwordEncrypted);
    let blocked: string[] = [];
    try { blocked = JSON.parse(account.blockedFolders); } catch { blocked = []; }

    const folders = await listFolders(
      { host: account.imapHost, port: account.imapPort, username: account.username, password },
      blocked,
    );

    return res.json({ folders, blockedFolders: blocked });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: extractSyncError(err) });
  }
});

// PATCH /api/email-accounts/:id
// Speichert die blockedFolders-Liste eines Kontos
router.patch('/:id', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = String(req.params.id);
    const userId = String(req.user!.id);

    const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) return res.status(404).json({ error: 'Konto nicht gefunden' });

    const schema = z.object({
      blockedFolders: z.array(z.string()),
    });
    const { blockedFolders } = schema.parse(req.body);

    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { blockedFolders: JSON.stringify(blockedFolders) },
    });

    return res.json({ success: true, blockedFolders });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Fehler beim Speichern der Ordnereinstellungen' });
  }
});

const accountSyncDeps = {
  decryptPassword,
  getUnprocessedEmails,
  applyOrderInfo,
};

function wantsSyncStream(req: AuthRequest): boolean {
  return req.headers.accept?.includes('text/event-stream') === true;
}

function writeSyncSse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleAccountSync(
  req: AuthRequest,
  res: Response,
  accountId: string,
  options: { fullResync?: boolean },
): Promise<void> {
  const userId = String(req.user!.id);
  const stream = wantsSyncStream(req);
  const lock = tryAcquireSyncLock(userId);
  if (!lock.ok) {
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      writeSyncSse(res, {
        type: 'error',
        error: lock.reason === 'busy_user'
          ? 'Es läuft bereits ein Sync für deinen Account.'
          : 'Zu viele gleichzeitige Syncs. Bitte später erneut versuchen.',
      });
      res.end();
    } else {
      syncLockResponse(res, lock.reason);
    }
    return;
  }

  try {
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    }

    const onProgress = stream
      ? (event: SyncProgressPayload) => writeSyncSse(res, event)
      : () => {};

    const result = await runAccountSyncWithProgress(
      accountSyncDeps,
      accountId,
      userId,
      options,
      onProgress,
    );

    if (stream) {
      writeSyncSse(res, { type: 'complete', ...result });
      res.end();
      return;
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    const message = extractSyncError(err);
    if (stream) {
      writeSyncSse(res, { type: 'error', error: message });
      res.end();
      return;
    }
    res.status(500).json({ error: message });
  } finally {
    lock.release();
  }
}

// POST /api/email-accounts/:id/sync
router.post('/:id/sync', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
  });
  if (!account) return res.status(404).json({ error: 'Konto nicht gefunden' });
  await handleAccountSync(req, res, String(req.params.id), {});
});

// POST /api/email-accounts/:id/resync
// Setzt alle verarbeiteten E-Mails zurück und startet einen kompletten Neusync
router.post('/:id/resync', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const account = await prisma.emailAccount.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
  });
  if (!account) return res.status(404).json({ error: 'Konto nicht gefunden' });
  await handleAccountSync(req, res, String(req.params.id), { fullResync: true });
});

// POST /api/email-accounts/sync-all
// Ablauf: 1) Alle Accounts abrufen  2) Alle E-Mails holen  3) Ein einziger Batch an GPT  4) Speichern
router.post('/sync-all', requireAuth, requirePayment, async (req: AuthRequest, res: Response) => {
  const userId = String(req.user!.id);

  const lock = tryAcquireSyncLock(userId);
  if (!lock.ok) return syncLockResponse(res, lock.reason);

  try {
    const accounts = await prisma.emailAccount.findMany({ where: { userId } });

    // ── Phase 1: E-Mails aus allen Accounts holen ──────────────────────────────
    type AccountEmails = {
      account: typeof accounts[number];
      emails: EmailRecord[];
      error?: string;
    };

    const accountEmailsList: AccountEmails[] = await Promise.all(
      accounts.map(async (account) => {
        try {
          const password = decryptPassword(account.passwordEncrypted);
          let blockedFolders: string[] = [];
          try { blockedFolders = JSON.parse(account.blockedFolders); } catch { blockedFolders = []; }
          const isFirstSync = !account.lastSyncAt;
          const twoMonthsAgo = new Date();
          twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

          const fetchOptions = isFirstSync
            ? { sinceDate: twoMonthsAgo, blockedFolders }
            : { sinceDate: new Date(account.lastSyncAt!.getTime() - 60 * 60 * 1000), blockedFolders };

          console.log(`[sync-all] ${isFirstSync ? 'Vollsync (letzte 2 Monate)' : 'Deltasync'} für ${account.email}`);
          const emails = await fetchEmails(
            { host: account.imapHost, port: account.imapPort, username: account.username, password },
            fetchOptions,
          );
          return { account, emails };
        } catch (err) {
          console.error(`[sync-all] Fehler beim Abrufen von ${account.email}:`, err);
          return { account, emails: [], error: extractSyncError(err) };
        }
      }),
    );

    // ── Phase 2: Unverarbeitete E-Mails über alle Accounts filtern ─────────────
    type UnprocessedItem = { email: EmailRecord; rawEmailId: string; accountId: string };
    const allUnprocessed: UnprocessedItem[] = [];

    for (const { account, emails } of accountEmailsList) {
      const unprocessed = await getUnprocessedEmails(emails, userId, account.id);
      for (const u of unprocessed) {
        allUnprocessed.push({ ...u, accountId: account.id });
      }
    }

    // ── Phase 3: Einziger Batch-Request an GPT für alle E-Mails ───────────────
    const analysisMap = allUnprocessed.length > 0
      ? await analyzeEmailsBatch(allUnprocessed.map(u => u.email))
      : new Map<string, import('../services/openai').OrderInfo>();

    console.log(`[sync-all] Batch abgeschlossen: ${analysisMap.size}/${allUnprocessed.length} Ergebnisse`);

    // ── Phase 4: Ergebnisse speichern & Accounts aktualisieren ─────────────────
    const counters = new Map<string, { newOrders: number; mergedOrders: number }>();

    for (const { email, rawEmailId, accountId } of allUnprocessed) {
      const orderInfo = analysisMap.get(email.uid) ?? { isOrder: false };
      try {
        const result = await applyOrderInfo(email, rawEmailId, orderInfo, userId, accountId);
        if (!counters.has(accountId)) counters.set(accountId, { newOrders: 0, mergedOrders: 0 });
        const c = counters.get(accountId)!;
        if (result === 'new') c.newOrders++;
        if (result === 'merged') c.mergedOrders++;
      } catch (err) {
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

    await deduplicateOrders(userId).catch(() => {});

    return res.json({ results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: extractSyncError(err) });
  } finally {
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
export async function syncUserAccounts(userId: string): Promise<{ newOrders: number; mergedOrders: number }> {
  const lock = tryAcquireSyncLock(userId);
  if (!lock.ok) {
    if (lock.reason === 'busy_user') {
      console.log(`[auto-sync] Nutzer ${userId} hat bereits einen laufenden Sync – übersprungen.`);
    } else {
      console.log(`[auto-sync] Globale Parallel-Grenze (${MAX_PARALLEL_USERS}) erreicht – Nutzer ${userId} übersprungen.`);
    }
    return { newOrders: 0, mergedOrders: 0 };
  }

  try {
    return await runSyncForUser(userId);
  } finally {
    lock.release();
  }
}

async function runSyncForUser(userId: string): Promise<{ newOrders: number; mergedOrders: number }> {
  const accounts = await prisma.emailAccount.findMany({ where: { userId } });
  if (accounts.length === 0) return { newOrders: 0, mergedOrders: 0 };

  type AccountEmails = { account: typeof accounts[number]; emails: EmailRecord[] };

  const accountEmailsList: AccountEmails[] = await Promise.all(
    accounts.map(async (account) => {
      try {
        const password = decryptPassword(account.passwordEncrypted);
        let blockedFolders: string[] = [];
        try { blockedFolders = JSON.parse(account.blockedFolders); } catch { blockedFolders = []; }
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        // Ersten Sync: letzte 2 Monate; alle weiteren: echter Delta (mit 1h Überlappung)
        const sinceDate = account.lastSyncAt
          ? new Date(account.lastSyncAt.getTime() - 60 * 60 * 1000)
          : twoMonthsAgo;

        console.log(`[auto-sync] Delta-Sync ${account.email} seit ${sinceDate.toISOString()}`);
        const emails = await fetchEmails(
          { host: account.imapHost, port: account.imapPort, username: account.username, password },
          { sinceDate, blockedFolders },
        );
        return { account, emails };
      } catch (err) {
        console.error(`[auto-sync] Fehler beim Abrufen von ${account.email}:`, extractSyncError(err));
        return { account, emails: [] };
      }
    }),
  );

  type UnprocessedItem = { email: EmailRecord; rawEmailId: string; accountId: string };
  const allUnprocessed: UnprocessedItem[] = [];

  for (const { account, emails } of accountEmailsList) {
    const unprocessed = await getUnprocessedEmails(emails, userId, account.id);
    for (const u of unprocessed) allUnprocessed.push({ ...u, accountId: account.id });
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
  const analysisMap = await analyzeEmailsBatch(allUnprocessed.map(u => u.email));

  let newOrders = 0;
  let mergedOrders = 0;

  for (const { email, rawEmailId, accountId } of allUnprocessed) {
    const orderInfo = analysisMap.get(email.uid) ?? { isOrder: false };
    try {
      const result = await applyOrderInfo(email, rawEmailId, orderInfo, userId, accountId);
      if (result === 'new') newOrders++;
      if (result === 'merged') mergedOrders++;
    } catch (err) {
      console.error('[auto-sync] Fehler beim Speichern:', err);
    }
  }

  const syncedAt = new Date();
  for (const { account } of accountEmailsList) {
    await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncAt: syncedAt } });
  }

  await deduplicateOrders(userId).catch(() => {});
  console.log(`[auto-sync] Nutzer ${userId}: ${newOrders} neue, ${mergedOrders} zusammengeführte Bestellungen`);
  return { newOrders, mergedOrders };
}

export default router;
