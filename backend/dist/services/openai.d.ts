import { EmailMessage } from './imap';
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
}
export declare function analyzeEmailForOrder(email: EmailMessage): Promise<OrderInfo>;
//# sourceMappingURL=openai.d.ts.map