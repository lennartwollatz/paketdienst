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
export declare const MAX_PARALLEL_USERS = 2;
export type LockReason = 'busy_user' | 'busy_global';
export declare class SyncLockError extends Error {
    readonly reason: LockReason;
    constructor(reason: LockReason);
}
/**
 * Versucht, ein Sync-Lock für `userId` zu reservieren.
 * @returns Release-Funktion bei Erfolg, sonst `null` mit dem Grund in `reason`.
 */
export declare function tryAcquireSyncLock(userId: string): {
    ok: true;
    release: () => void;
} | {
    ok: false;
    reason: LockReason;
};
/**
 * Führt `fn` unter Sync-Lock aus. Wirft `SyncLockError`, wenn das Lock nicht
 * erworben werden kann.
 */
export declare function withSyncLock<T>(userId: string, fn: () => Promise<T>): Promise<T>;
/** Aktuelle Anzahl laufender Syncs (für Monitoring/Logs). */
export declare function activeSyncCount(): number;
/** True, wenn aktuell ein Sync für diesen Nutzer läuft. */
export declare function isUserSyncing(userId: string): boolean;
//# sourceMappingURL=syncLock.d.ts.map