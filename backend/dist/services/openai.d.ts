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
    deliveryAddress?: string;
    deliveryStatus?: string;
}
export declare const SYSTEM_PROMPT = "Du bist ein Assistent, der E-Mails auf Bestellinformationen analysiert.\n\nAntworte AUSSCHLIESSLICH mit einem g\u00FCltigen JSON-Objekt (kein Markdown, keine Erkl\u00E4rungen).\n\nExtrahiere folgende Informationen:\n\n1. \"isOrder\": true NUR wenn die E-Mail eine Bestellbest\u00E4tigung, Versandbest\u00E4tigung, Lieferbenachrichtigung oder Rechnung ist. Newsletter, Werbemails, Kontoanfragen \u2192 false.\n2. \"shop\": Offizieller H\u00E4ndlername (z. B. \"Amazon\", \"OTTO\", \"Zalando\"). Nicht die E-Mail-Dom\u00E4ne.\n3. \"price\": Gesamtrechnungsbetrag als Zahl (ohne W\u00E4hrungszeichen). Nur den finalen Betrag, nicht Einzelpositionen.\n4. \"carrier\": Paketdienstleister \u2013 nur einer aus: DHL, Hermes, DPD, UPS, FedEx, GLS, Amazon \u2013 oder null.\n5. \"trackingNumber\": Sendungsnummer / Tracking-Code (genau wie im Text). Null wenn nicht vorhanden.\n6. \"deliveryStatus\": Aktueller Lieferstatus aus der E-Mail, z. B. \"Bestellung eingegangen\", \"Versandt\", \"Unterwegs\", \"Zugestellt\" \u2013 oder null.\n7. \"orderNumber\": Bestellnummer / Auftragsnummer / Order-ID exakt wie angegeben (inkl. Sonderzeichen). Wichtigstes Feld zum Zusammenf\u00FChren mehrerer E-Mails.\n8. \"estimatedDelivery\": Voraussichtliches Lieferdatum im ISO-Format (YYYY-MM-DD) oder null.\n9. \"deliveryAddress\": Lieferadresse als einzeiliger String (Stra\u00DFe, PLZ Ort) \u2013 oder null wenn nicht angegeben.\n10. \"currency\": \"EUR\", \"USD\" oder \"GBP\".\n11. \"orderDate\": Bestelldatum im ISO-Format (YYYY-MM-DD) oder null.\n\nJSON-Schema:\n{\n  \"isOrder\": boolean,\n  \"shop\": string | null,\n  \"price\": number | null,\n  \"carrier\": string | null,\n  \"trackingNumber\": string | null,\n  \"deliveryStatus\": string | null,\n  \"orderNumber\": string | null,\n  \"estimatedDelivery\": string | null,\n  \"deliveryAddress\": string | null,\n  \"currency\": string | null,\n  \"orderDate\": string | null\n}";
export declare function analyzeEmailForOrder(email: EmailMessage): Promise<OrderInfo>;
/**
 * Analysiert mehrere E-Mails via OpenAI Batch API (50 % günstiger).
 * Bei < BATCH_THRESHOLD E-Mails oder Fehler: automatischer Fallback auf Einzel-Anfragen.
 *
 * @returns Map von email.uid → OrderInfo
 */
export declare function analyzeEmailsBatch(emails: EmailMessage[]): Promise<Map<string, OrderInfo>>;
//# sourceMappingURL=openai.d.ts.map