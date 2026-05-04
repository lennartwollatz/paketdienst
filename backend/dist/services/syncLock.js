"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncLockError = exports.MAX_PARALLEL_USERS = void 0;
exports.tryAcquireSyncLock = tryAcquireSyncLock;
exports.withSyncLock = withSyncLock;
exports.activeSyncCount = activeSyncCount;
exports.isUserSyncing = isUserSyncing;
/** Maximale Anzahl gleichzeitig synchronisierender Nutzer (systemweit). */
exports.MAX_PARALLEL_USERS = 2;
const runningUsers = new Set();
class SyncLockError extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
        this.name = 'SyncLockError';
    }
}
exports.SyncLockError = SyncLockError;
/**
 * Versucht, ein Sync-Lock für `userId` zu reservieren.
 * @returns Release-Funktion bei Erfolg, sonst `null` mit dem Grund in `reason`.
 */
function tryAcquireSyncLock(userId) {
    if (runningUsers.has(userId)) {
        return { ok: false, reason: 'busy_user' };
    }
    if (runningUsers.size >= exports.MAX_PARALLEL_USERS) {
        return { ok: false, reason: 'busy_global' };
    }
    runningUsers.add(userId);
    let released = false;
    return {
        ok: true,
        release: () => {
            if (released)
                return;
            released = true;
            runningUsers.delete(userId);
        },
    };
}
/**
 * Führt `fn` unter Sync-Lock aus. Wirft `SyncLockError`, wenn das Lock nicht
 * erworben werden kann.
 */
async function withSyncLock(userId, fn) {
    const lock = tryAcquireSyncLock(userId);
    if (!lock.ok)
        throw new SyncLockError(lock.reason);
    try {
        return await fn();
    }
    finally {
        lock.release();
    }
}
/** Aktuelle Anzahl laufender Syncs (für Monitoring/Logs). */
function activeSyncCount() {
    return runningUsers.size;
}
/** True, wenn aktuell ein Sync für diesen Nutzer läuft. */
function isUserSyncing(userId) {
    return runningUsers.has(userId);
}
//# sourceMappingURL=syncLock.js.map