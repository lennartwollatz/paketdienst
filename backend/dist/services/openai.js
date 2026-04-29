"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeEmailForOrder = analyzeEmailForOrder;
const openai_1 = __importDefault(require("openai"));
function getOpenAI() {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'sk-PLACEHOLDER')
        return null;
    return new openai_1.default({ apiKey: key });
}
const CARRIERS = {
    DHL: ['dhl', 'deutsche post'],
    Hermes: ['hermes', 'evri'],
    DPD: ['dpd'],
    UPS: ['ups'],
    FedEx: ['fedex', 'fed ex'],
    GLS: ['gls'],
    Amazon: ['amazon logistics', 'amazon'],
};
function detectCarrierFromText(text) {
    const lower = text.toLowerCase();
    for (const [carrier, keywords] of Object.entries(CARRIERS)) {
        if (keywords.some(kw => lower.includes(kw)))
            return carrier;
    }
    return undefined;
}
function extractTrackingNumberFallback(text) {
    const patterns = [
        /\b([0-9]{12,22})\b/,
        /\b([A-Z]{2}[0-9]{9}[A-Z]{2})\b/,
        /Sendungsnummer[:\s]+([A-Z0-9]{8,25})/i,
        /Tracking[- ]?(?:Number|Nr|ID|Code)[:\s]+([A-Z0-9]{8,25})/i,
        /Verfolgungsnummer[:\s]+([A-Z0-9]{8,25})/i,
        /1Z[A-Z0-9]{16}/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match)
            return match[1] || match[0];
    }
    return undefined;
}
function extractPriceFallback(text) {
    const match = text.match(/(\d+[.,]\d{2})\s*(€|EUR|USD|\$)/);
    if (match) {
        const price = parseFloat(match[1].replace(',', '.'));
        const currency = match[2] === '€' ? 'EUR' : match[2] === '$' ? 'USD' : match[2];
        return { price, currency };
    }
    return {};
}
async function analyzeEmailForOrder(email) {
    const openai = getOpenAI();
    const content = `Betreff: ${email.subject}\nAbsender: ${email.from}\n\n${email.text.slice(0, 3000)}`;
    if (openai) {
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Du analysierst E-Mails und extrahierst Bestellinformationen. 
Antworte NUR mit einem JSON-Objekt ohne Markdown-Formatierung.
Format:
{
  "isOrder": boolean,
  "shop": "Shop-Name oder null",
  "orderNumber": "Bestellnummer oder null",
  "trackingNumber": "Sendungsnummer oder null",
  "carrier": "DHL|Hermes|DPD|UPS|FedEx|GLS|Amazon|Sonstige oder null",
  "price": Zahl oder null,
  "currency": "EUR|USD|GBP oder null",
  "orderDate": "ISO-Datum oder null",
  "estimatedDelivery": "ISO-Datum oder null"
}`,
                    },
                    {
                        role: 'user',
                        content,
                    },
                ],
                temperature: 0,
                max_tokens: 300,
            });
            const text = response.choices[0]?.message?.content?.trim();
            if (text) {
                const parsed = JSON.parse(text);
                return parsed;
            }
        }
        catch (err) {
            console.error('OpenAI-Fehler, verwende Fallback:', err);
        }
    }
    // Regelbasierter Fallback
    const lower = (email.subject + ' ' + email.text).toLowerCase();
    const isOrderKeyword = [
        'bestellung', 'order', 'bestätigung', 'confirmation',
        'rechnung', 'invoice', 'versand', 'shipping', 'lieferung', 'delivery',
        'sendungsnummer', 'tracking', 'paket',
    ].some(kw => lower.includes(kw));
    if (!isOrderKeyword)
        return { isOrder: false };
    const tracking = extractTrackingNumberFallback(email.text);
    const carrier = detectCarrierFromText(email.text);
    const { price, currency } = extractPriceFallback(email.text);
    const shopMatch = email.from.match(/@([\w-]+)\./);
    const shop = shopMatch
        ? shopMatch[1].charAt(0).toUpperCase() + shopMatch[1].slice(1)
        : email.from;
    return {
        isOrder: true,
        shop,
        trackingNumber: tracking,
        carrier,
        price,
        currency: currency || 'EUR',
        orderDate: email.date.toISOString(),
    };
}
//# sourceMappingURL=openai.js.map