import { PrismaClient } from '@prisma/client';
import { syncUserAccounts } from '../routes/emailAccounts';

const prisma = new PrismaClient();

const INTERVAL_MS = 60 * 60 * 1000; // 1 Stunde

async function runAutoSync() {
  console.log('[auto-sync] Starte stündlichen E-Mail-Sync...');

  let users: { id: string }[];
  try {
    users = await prisma.user.findMany({ select: { id: true } });
  } catch (err) {
    console.error('[auto-sync] Fehler beim Laden der Nutzer:', err);
    return;
  }

  for (const user of users) {
    try {
      const { newOrders, mergedOrders } = await syncUserAccounts(user.id);
      if (newOrders > 0 || mergedOrders > 0) {
        console.log(
          `[auto-sync] Nutzer ${user.id}: ${newOrders} neue, ${mergedOrders} zusammengeführte Bestellungen`,
        );
      }
    } catch (err) {
      console.error(`[auto-sync] Unerwarteter Fehler bei Nutzer ${user.id}:`, err);
    }
  }

  console.log('[auto-sync] Sync abgeschlossen.');
}

export function startEmailPoller() {
  console.log(`[auto-sync] E-Mail-Poller gestartet (Intervall: ${INTERVAL_MS / 60000} Minuten)`);

  // Ersten Lauf nach 1 Minute (damit der Server vollständig gestartet ist)
  setTimeout(() => {
    runAutoSync().catch(err => console.error('[auto-sync] Fehler:', err));
  }, 60 * 1000);

  // Danach stündlich
  setInterval(() => {
    runAutoSync().catch(err => console.error('[auto-sync] Fehler:', err));
  }, INTERVAL_MS);
}
