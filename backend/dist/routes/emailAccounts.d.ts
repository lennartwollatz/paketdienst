declare const router: import("express-serve-static-core").Router;
export declare function decryptPassword(encrypted: string): string;
/**
 * Führt einen Delta-Sync für alle E-Mail-Accounts eines Nutzers durch.
 * Wird vom automatischen stündlichen Poller aufgerufen.
 */
export declare function syncUserAccounts(userId: string): Promise<{
    newOrders: number;
    mergedOrders: number;
}>;
export default router;
//# sourceMappingURL=emailAccounts.d.ts.map