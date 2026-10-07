"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeDhlStatusFallback = analyzeDhlStatusFallback;
exports.analyzeDhlTrackingStatus = analyzeDhlTrackingStatus;
const openai_1 = __importDefault(require("openai"));
const normalization_1 = require("./normalization");
const VALID_INTERNAL_STATUSES = [
    'info_received',
    'in_transit',
    'in_packstation',
    'delivered',
];
const SYSTEM_PROMPT = `Du analysierst den Detaillierten Sendungsverlauf einer DHL-Sendung.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt (kein Markdown).

Bestimme den aktuellen Lieferstatus anhand des neuesten Eintrags im Verlauf und mappe ihn auf genau einen dieser internen Status-Werte:

- "info_received" → In Bearbeitung (elektronisch angekündigt, Auftragsdaten übermittelt, noch nicht versandt)
- "in_transit" → Im Versand (bearbeitet, im Transport, in Region des Empfängers, zur Zustellung unterwegs)
- "in_packstation" → In Packstation (bereit zur Abholung an Packstation, Paketshop, Filiale oder Abholstation)
- "delivered" → Zugestellt (zugestellt, erfolgreich ausgeliefert, abgeholt)

JSON-Schema:
{
  "internalStatus": "info_received" | "in_transit" | "in_packstation" | "delivered",
  "reasoning": "kurze Begründung auf Deutsch"
}`;
function getOpenAI() {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'sk-PLACEHOLDER')
        return null;
    return new openai_1.default({ apiKey: key });
}
function parseAnalysisResponse(text) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            return null;
        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.internalStatus || !VALID_INTERNAL_STATUSES.includes(parsed.internalStatus)) {
            return null;
        }
        const internalStatus = parsed.internalStatus;
        return {
            internalStatus,
            status: (0, normalization_1.internalStatusToDb)(internalStatus),
            reasoning: parsed.reasoning,
        };
    }
    catch {
        return null;
    }
}
/** Regelbasierter Fallback, wenn OpenAI nicht verfügbar ist. */
function analyzeDhlStatusFallback(sendungsverlaufText) {
    const text = sendungsverlaufText.toLowerCase();
    if (/zugestellt|erfolgreich (aus)?geliefert|abgeholt|delivery successful/i.test(text)) {
        return { internalStatus: 'delivered', status: (0, normalization_1.internalStatusToDb)('delivered') };
    }
    if (/packstation|paketshop|abholstation|bereit zur abholung|parcel locker/i.test(text)) {
        return { internalStatus: 'in_packstation', status: (0, normalization_1.internalStatusToDb)('in_packstation') };
    }
    if (/elektronisch angekündigt|auftragsdaten|noch nicht|wird bearbeitet/i.test(text)
        && !/versandt|unterwegs|transport|region des empfängers|zustellung/i.test(text)) {
        return { internalStatus: 'info_received', status: (0, normalization_1.internalStatusToDb)('info_received') };
    }
    return { internalStatus: 'in_transit', status: (0, normalization_1.internalStatusToDb)('in_transit') };
}
/**
 * Sendet den programmatisch extrahierten Sendungsverlauf an ChatGPT,
 * um den aktuellen Lieferstatus zu ermitteln.
 */
async function analyzeDhlTrackingStatus(sendungsverlaufText) {
    const openai = getOpenAI();
    if (!openai || !sendungsverlaufText.trim()) {
        return analyzeDhlStatusFallback(sendungsverlaufText);
    }
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: sendungsverlaufText,
                },
            ],
            temperature: 0,
            max_tokens: 200,
            response_format: { type: 'json_object' },
        });
        const text = response.choices[0]?.message?.content?.trim();
        if (text) {
            const parsed = parseAnalysisResponse(text);
            if (parsed)
                return parsed;
        }
    }
    catch (err) {
        console.error('[DHL Web] KI-Statusanalyse fehlgeschlagen:', err);
    }
    return analyzeDhlStatusFallback(sendungsverlaufText);
}
//# sourceMappingURL=dhlStatusAnalysis.js.map