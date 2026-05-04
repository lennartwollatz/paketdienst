declare const router: import("express-serve-static-core").Router;
export declare function decryptPassword(encrypted: string): string;
/**
 * Führt einen Delta-Sync für alle E-Mail-Accounts eines Nutzers durch.
 * Wird vom automatischen stündlichen Poller aufgerufen.
 *
 * Wird automatisch übersprungen, wenn der Nutzer bereits einen Sync laufen
 * hat oder die globale Parallel-Grenze erreicht ist.
 */
export declare function syncUserAccounts(userId: string): Promise<{
    newOrders: number;
    mergedOrders: number;
}>;
export default router;
//# sourceMappingURL=emailAccounts.d.ts.map