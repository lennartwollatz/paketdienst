import { EmailMessage } from './imap';
import { type OrderCategoryId } from '../constants/orderCategories';
export interface OrderInfo {
    isOrder: boolean;
    shop?: string;
    orderNumber?: string;
    trackingNumber?: string;
    carrier?: string;
    price?: number;
    currency?: string;
    orderDate?: string;
    estimatedDelivery?: string;
    deliveryAddress?: string;
    deliveryStatus?: string;
    category?: OrderCategoryId;
}
export declare const SYSTEM_PROMPT: string;
export declare function analyzeEmailForOrder(email: EmailMessage): Promise<OrderInfo>;
/**
 * Analysiert mehrere E-Mails via OpenAI Batch API (50 % günstiger).
 * Bei < BATCH_THRESHOLD E-Mails oder Fehler: automatischer Fallback auf Einzel-Anfragen.
 *
 * @returns Map von email.uid → OrderInfo
 */
export declare function analyzeEmailsBatch(emails: EmailMessage[], onProgress?: (current: number, total: number) => void): Promise<Map<string, OrderInfo>>;
//# sourceMappingURL=openai.d.ts.map