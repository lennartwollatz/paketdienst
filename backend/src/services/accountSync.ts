import { PrismaClient } from '@prisma/client';
import { fetchEmails } from './imap';
import { analyzeEmailsBatch } from './openai';
import { deduplicateOrders } from '../routes/orders';
import { ACTIVE_TRACKING_STATUSES, refreshOrderTracking } from './tracking/refreshOrder';
import {
  buildSyncProgress,
  SyncPhase,
  SyncProgressPayload,
} from './syncProgress';

const prisma = new PrismaClient();

type EmailRecord = Awaited<ReturnType<typeof fetchEmails>>[number];

export interface AccountSyncResult {
  processed: number;
  newOrders: number;
  mergedOrders: number;
  message: string;
}

type ProgressCallback = (event: SyncProgressPayload) => void;

function emptyPhases() {
  return {
    fetch:    { current: 0, total: 0 },
    analyze:  { current: 0, total: 0 },
    tracking: { current: 0, total: 0 },
    load:     { current: 0, total: 0 },
  } as Record<SyncPhase, { current: number; total: number }>;
}

export interface AccountSyncDeps {
  decryptPassword: (encrypted: string) => string;
  getUnprocessedEmails: (
    emails: EmailRecord[],
    userId: string,
    accountId: string,
  ) => Promise<{ email: EmailRecord; rawEmailId: string }[]>;
  applyOrderInfo: (
    email: EmailRecord,
    rawEmailId: string,
    orderInfo: import('./openai').OrderInfo,
    userId: string,
    accountId: string,
  ) => Promise<'new' | 'merged' | 'skipped'>;
}

export async function runAccountSyncWithProgress(
  deps: AccountSyncDeps,
  accountId: string,
  userId: string,
  options: { fullResync?: boolean },
  onProgress: ProgressCallback,
): Promise<AccountSyncResult> {
  const phases = emptyPhases();
  const emit = (phase: SyncPhase, current: number, total: number, label?: string) => {
    phases[phase] = { current, total };
    onProgress(buildSyncProgress(phase, current, total, phases, label));
  };

  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) throw new Error('Konto nicht gefunden');

  if (options.fullResync) {
    await prisma.processedEmail.deleteMany({
      where: { userId, rawEmailId: { contains: accountId } },
    });
    await prisma.order.deleteMany({ where: { userId, emailAccountId: accountId } });
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: null },
    });
  }

  const password = deps.decryptPassword(account.passwordEncrypted);
  let blockedFolders: string[] = [];
  try { blockedFolders = JSON.parse(account.blockedFolders); } catch { blockedFolders = []; }

  const isFirstSync = !account.lastSyncAt;
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const fetchOptions = isFirstSync
    ? { sinceDate: twoMonthsAgo, blockedFolders }
    : { sinceDate: new Date(account.lastSyncAt!.getTime() - 60 * 60 * 1000), blockedFolders };

  emit('fetch', 0, 1, 'Verbindung zum E-Mail-Server…');

  const emails = await fetchEmails(
    { host: account.imapHost, port: account.imapPort, username: account.username, password },
    fetchOptions,
  );

  const fetchTotal = Math.max(emails.length, 1);
  for (let i = 0; i < emails.length; i++) {
    emit('fetch', i + 1, fetchTotal);
  }
  if (emails.length === 0) {
    emit('fetch', 1, 1, 'Keine E-Mails im Zeitraum');
  }

  const unprocessed = await deps.getUnprocessedEmails(emails, userId, account.id);
  const analyzeTotal = Math.max(unprocessed.length, 1);

  let newOrders = 0;
  let mergedOrders = 0;

  if (unprocessed.length === 0) {
    emit('analyze', 1, 1, 'Keine neuen E-Mails zu verarbeiten');
  } else {
    emit('analyze', 0, analyzeTotal, 'KI-Analyse wird vorbereitet…');

    const analysisMap = await analyzeEmailsBatch(
      unprocessed.map((u) => u.email),
      (current, total) => emit('analyze', current, total),
    );

    let saved = 0;
    for (const { email, rawEmailId } of unprocessed) {
      const orderInfo = analysisMap.get(email.uid) ?? { isOrder: false };
      const result = await deps.applyOrderInfo(email, rawEmailId, orderInfo, userId, account.id);
      if (result === 'new') newOrders++;
      if (result === 'merged') mergedOrders++;
      saved++;
      emit('analyze', saved, analyzeTotal, 'Bestellungen werden gespeichert');
    }
  }

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date() },
  });

  const dedupCount = await deduplicateOrders(userId);
  mergedOrders += dedupCount;

  const ordersToTrack = await prisma.order.findMany({
    where: {
      userId,
      trackingNumber: { not: null },
      status: { in: [...ACTIVE_TRACKING_STATUSES] },
    },
    select: { id: true },
  });

  const trackTotal = Math.max(ordersToTrack.length, 1);
  if (ordersToTrack.length === 0) {
    emit('tracking', 1, 1, 'Keine offenen Sendungen');
  } else {
    for (let i = 0; i < ordersToTrack.length; i++) {
      try {
        await refreshOrderTracking(ordersToTrack[i].id, { sendPush: false });
      } catch (err) {
        console.warn(`[sync] Tracking-Update fehlgeschlagen (${ordersToTrack[i].id}):`, err);
      }
      emit('tracking', i + 1, trackTotal);
    }
  }

  const processed = emails.length;
  return {
    processed,
    newOrders,
    mergedOrders,
    message: `Sync abgeschlossen: ${processed} E-Mails verarbeitet, ${newOrders} neue Bestellungen, ${mergedOrders} zusammengeführt.`,
  };
}
