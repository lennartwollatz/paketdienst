/**
 * Einfaches In-Memory-Lock für E-Mail-Sync-Vorgänge.
 *
 * Regeln:
 * - Pro Nutzer darf maximal **ein** Sync gleichzeitig laufen.
 * - Insgesamt dürfen maximal MAX_PARALLEL_USERS Nutzer parallel synchronisieren.
 *
 * Damit werden u. a. doppelte ProcessedEmail-Inserts und parallele
 * IMAP/GPT-Batches vermieden (Prisma P2002 / verdoppelte Kosten).
 */

/** Maximale Anzahl gleichzeitig synchronisierender Nutzer (systemweit). */
export const MAX_PARALLEL_USERS = 2;

const runningUsers = new Set<string>();

export type LockReason = 'busy_user' | 'busy_global';

export class SyncLockError extends Error {
  constructor(public readonly reason: LockReason) {
    super(reason);
    this.name = 'SyncLockError';
  }
}

/**
 * Versucht, ein Sync-Lock für `userId` zu reservieren.
 * @returns Release-Funktion bei Erfolg, sonst `null` mit dem Grund in `reason`.
 */
export function tryAcquireSyncLock(
  userId: string,
):
  | { ok: true; release: () => void }
  | { ok: false; reason: LockReason } {
  if (runningUsers.has(userId)) {
    return { ok: false, reason: 'busy_user' };
  }
  if (runningUsers.size >= MAX_PARALLEL_USERS) {
    return { ok: false, reason: 'busy_global' };
  }

  runningUsers.add(userId);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      runningUsers.delete(userId);
    },
  };
}

/**
 * Führt `fn` unter Sync-Lock aus. Wirft `SyncLockError`, wenn das Lock nicht
 * erworben werden kann.
 */
export async function withSyncLock<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lock = tryAcquireSyncLock(userId);
  if (!lock.ok) throw new SyncLockError(lock.reason);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

/** Aktuelle Anzahl laufender Syncs (für Monitoring/Logs). */
export function activeSyncCount(): number {
  return runningUsers.size;
}

/** True, wenn aktuell ein Sync für diesen Nutzer läuft. */
export function isUserSyncing(userId: string): boolean {
  return runningUsers.has(userId);
}
