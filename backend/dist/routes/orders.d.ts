declare const router: import("express-serve-static-core").Router;
/**
 * Fasst Bestellungen mit gleicher orderNumber oder trackingNumber eines Nutzers zusammen.
 * Wird automatisch nach jedem Sync aufgerufen.
 */
export declare function deduplicateOrders(userId: string): Promise<number>;
export default router;
//# sourceMappingURL=orders.d.ts.map