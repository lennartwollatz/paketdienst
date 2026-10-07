import type { OrderCategoryId } from '../constants/orderCategories';
/**
 * Regelbasierter Fallback, wenn GPT keine Kategorie liefert.
 * Gibt null zurück, wenn keine sichere Zuordnung möglich ist.
 */
export declare function inferOrderCategory(shop: string | null | undefined, subject: string, body: string): OrderCategoryId | null;
//# sourceMappingURL=orderCategoryInference.d.ts.map