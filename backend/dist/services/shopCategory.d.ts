export declare function normalizeShopKey(shop: string): string;
export declare function getShopCategoryRule(userId: string, shop: string): Promise<string | null>;
type ExistingCategory = {
    category: string | null;
    categoryManual: boolean;
};
/**
 * Kategorie für Sync/Anlage: manuelle Zuordnung bleibt, sonst Anbieter-Regel, sonst GPT/bestehend.
 */
export declare function resolveOrderCategory(userId: string, shop: string, gptCategory: string | null | undefined, existing?: ExistingCategory): Promise<string | null>;
/** Speichert Anbieter-Regel und setzt Kategorie bei allen nicht-manuellen Bestellungen desselben Shops. */
export declare function applyShopCategoryAssignment(userId: string, shop: string, category: string | null, excludeOrderId: string): Promise<number>;
export {};
//# sourceMappingURL=shopCategory.d.ts.map