"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_PROMPT = void 0;
exports.analyzeEmailForOrder = analyzeEmailForOrder;
exports.analyzeEmailsBatch = analyzeEmailsBatch;
const openai_1 = __importStar(require("openai"));
const orderCategories_1 = require("../constants/orderCategories");
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
function extractOrderNumberFallback(text) {
    const patterns = [
        /Bestellnummer[:\s#]+([A-Z0-9\-]{4,30})/i,
        /Bestell(?:ung)?(?:snr|snummer|[-.\s]?Nr|[-.\s]?ID)?[:\s#]+([A-Z0-9\-]{4,30})/i,
        /Auftragsnummer[:\s#]+([A-Z0-9\-]{4,30})/i,
        /Order[- ]?(?:Number|Nr|ID|No\.?)[:\s#]+([A-Z0-9\-]{4,30})/i,
        /Order[:\s#]+([A-Z0-9\-]{6,30})/i,
        /#([A-Z0-9\-]{6,20})\b/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1])
            return match[1].trim();
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
/** Regelbasierter Fallback wenn OpenAI nicht verfügbar ist */
function fallbackAnalysis(email) {
    const lower = (email.subject + ' ' + email.text).toLowerCase();
    const isOrderKeyword = [
        'bestellung', 'order', 'bestätigung', 'confirmation',
        'rechnung', 'invoice', 'versand', 'shipping', 'lieferung', 'delivery',
        'sendungsnummer', 'tracking', 'paket',
    ].some(kw => lower.includes(kw));
    if (!isOrderKeyword)
        return { isOrder: false };
    const orderNumber = extractOrderNumberFallback(email.text) || extractOrderNumberFallback(email.subject);
    const tracking = extractTrackingNumberFallback(email.text);
    const carrier = detectCarrierFromText(email.text);
    const { price, currency } = extractPriceFallback(email.text);
    const shopMatch = email.from.match(/@([\w-]+)\./);
    const shop = shopMatch
        ? shopMatch[1].charAt(0).toUpperCase() + shopMatch[1].slice(1)
        : email.from;
    return {
        isOrder: true, shop, orderNumber,
        trackingNumber: tracking, carrier, price,
        currency: currency || 'EUR',
        orderDate: email.date.toISOString(),
    };
}
exports.SYSTEM_PROMPT = `Du bist ein Assistent, der E-Mails auf Bestellinformationen analysiert.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt (kein Markdown, keine Erklärungen).

Extrahiere folgende Informationen:

1. "isOrder": true NUR wenn die E-Mail eine Bestellbestätigung, Versandbestätigung, Lieferbenachrichtigung oder Rechnung ist. Newsletter, Werbemails, Kontoanfragen → false.
2. "shop": Offizieller Händlername (z. B. "Amazon", "OTTO", "Zalando"). Nicht die E-Mail-Domäne.
3. "price": Gesamtrechnungsbetrag als Zahl (ohne Währungszeichen). Nur den finalen Betrag, nicht Einzelpositionen.
4. "carrier": Paketdienstleister – nur einer aus: DHL, Hermes, DPD, UPS, FedEx, GLS, Amazon – oder null.
5. "trackingNumber": Sendungsnummer / Tracking-Code (genau wie im Text). Null wenn nicht vorhanden.
6. "deliveryStatus": Aktueller Lieferstatus aus der E-Mail, z. B. "Bestellung eingegangen", "Versandt", "Unterwegs", "Zugestellt" – oder null.
7. "orderNumber": Bestellnummer / Auftragsnummer / Order-ID exakt wie angegeben (inkl. Sonderzeichen). Wichtigstes Feld zum Zusammenführen mehrerer E-Mails.
8. "estimatedDelivery": Voraussichtliches Lieferdatum im ISO-Format (YYYY-MM-DD) oder null.
9. "deliveryAddress": Lieferadresse als einzeiliger String (Straße, PLZ Ort) – oder null wenn nicht angegeben.
10. "currency": "EUR", "USD" oder "GBP".
11. "orderDate": Bestelldatum im ISO-Format (YYYY-MM-DD) oder null.
12. "category": Kategorie des Kaufs – genau eine ID aus dieser Liste (sonst null):
    klamotten, software_technik, kosmetik, essen, transport_logistik, freizeit_sport, auto, finanzen, gesundheit, haus_wohnen, urlaub
    – klamotten: Mode, Schuhe, Textilien
    – software_technik: Software, Apps, Hardware, Elektronik
    – kosmetik: Pflege, Make-up, Parfum
    – essen: Lebensmittel, Restaurant, Supermarkt
    – transport_logistik: Paketdienste, Versandbenachrichtigungen ohne Shopkauf
    – freizeit_sport: Sport, Events, Hobbys (ohne Reisen/Urlaub)
    – auto: Teile, Werkstatt, Kraftstoff
    – finanzen: Bank, Versicherung, Abos mit Finanzbezug
    – gesundheit: Apotheke, Arzt, Nahrungsergänzung
    – haus_wohnen: Möbel, Baumarkt, Haushalt
    – urlaub: Flüge, Hotels, Ferienwohnungen, Reisen, Pauschalreisen

JSON-Schema:
{
  "isOrder": boolean,
  "shop": string | null,
  "price": number | null,
  "carrier": string | null,
  "trackingNumber": string | null,
  "deliveryStatus": string | null,
  "orderNumber": string | null,
  "estimatedDelivery": string | null,
  "deliveryAddress": string | null,
  "currency": string | null,
  "orderDate": string | null,
  "category": ${JSON.stringify(orderCategories_1.ORDER_CATEGORY_IDS)} | null
}`;
/**
 * Bereinigt den Plaintext einer E-Mail, um Tokens zu sparen:
 * - HTML-Tags und -Entities entfernen
 * - Mehrfache Leerzeichen → einzelnes Leerzeichen
 * - Führende/nachfolgende Leerzeichen pro Zeile
 * - Reine Trennzeilen (----, ====, …) entfernen
 * - Mehr als zwei aufeinanderfolgende Leerzeilen auf eine reduzieren
 */
function cleanEmailText(raw) {
    return raw
        .replace(/<[^>]+>/g, ' ') // HTML-Tags
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#\d+;/g, ' ') // numerische HTML-Entities
        .replace(/[^\S\n]+/g, ' ') // mehrfache Leerzeichen (kein Zeilenumbruch)
        .split('\n')
        .map(l => l.trim())
        .filter(l => !/^[-=_*#|~]{3,}$/.test(l)) // Trennzeilen
        .join('\n')
        .replace(/\n{3,}/g, '\n\n') // max. zwei aufeinanderfolgende Leerzeilen
        .trim();
}
function buildUserContent(email) {
    const body = cleanEmailText(email.text);
    return `Betreff: ${email.subject}\nAbsender: ${email.from}\nDatum: ${email.date.toISOString()}\n\n${body}`;
}
function parseOrderInfoJson(text) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            return null;
        const raw = JSON.parse(jsonMatch[0]);
        const category = (0, orderCategories_1.normalizeOrderCategory)(raw.category);
        return { ...raw, category: category ?? undefined };
    }
    catch { }
    return null;
}
/** Maximale PDF-Größe für GPT (Bytes) */
const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Maximal so viele PDF-Anhänge pro E-Mail für die Nachanalyse */
const MAX_PDFS_PER_EMAIL = 2;
const PDF_SYSTEM_PROMPT = `Du analysierst PDF-Anhänge von Bestellungen (Rechnungen, Bestellbestätigungen, Lieferscheine).

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt (kein Markdown).

Extrahiere nur Informationen, die im PDF klar erkennbar sind. Felder ohne Treffer → null.

JSON-Schema (gleiche Felder wie bei E-Mail-Analyse, isOrder immer true):
{
  "isOrder": true,
  "shop": string | null,
  "price": number | null,
  "carrier": string | null,
  "trackingNumber": string | null,
  "deliveryStatus": string | null,
  "orderNumber": string | null,
  "estimatedDelivery": string | null,
  "deliveryAddress": string | null,
  "currency": string | null,
  "orderDate": string | null,
  "category": ${JSON.stringify(orderCategories_1.ORDER_CATEGORY_IDS)} | null
}`;
function isPresentString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
/** Fehlen nach E-Mail-Analyse noch wichtige Bestelldaten? */
function needsPdfSupplement(info) {
    if (!info.isOrder)
        return false;
    const shopMissing = !isPresentString(info.shop);
    const priceMissing = info.price == null || Number.isNaN(info.price);
    const addressMissing = !isPresentString(info.deliveryAddress);
    return shopMissing || priceMissing || addressMissing;
}
function listMissingFields(info) {
    const missing = [];
    if (!isPresentString(info.shop))
        missing.push('shop (Händlername)');
    if (info.price == null || Number.isNaN(info.price))
        missing.push('price (Gesamtbetrag)');
    if (!isPresentString(info.deliveryAddress))
        missing.push('deliveryAddress (Lieferadresse)');
    return missing;
}
/** Ergänzt fehlende Felder aus PDF-Daten, ohne vorhandene Werte zu überschreiben */
function mergeOrderInfo(base, fromPdf) {
    return {
        ...base,
        isOrder: true,
        shop: isPresentString(base.shop) ? base.shop : fromPdf.shop,
        price: base.price ?? fromPdf.price,
        currency: base.currency ?? fromPdf.currency,
        deliveryAddress: isPresentString(base.deliveryAddress)
            ? base.deliveryAddress
            : fromPdf.deliveryAddress,
        orderNumber: isPresentString(base.orderNumber) ? base.orderNumber : fromPdf.orderNumber,
        trackingNumber: isPresentString(base.trackingNumber)
            ? base.trackingNumber
            : fromPdf.trackingNumber,
        carrier: base.carrier ?? fromPdf.carrier,
        deliveryStatus: base.deliveryStatus ?? fromPdf.deliveryStatus,
        orderDate: base.orderDate ?? fromPdf.orderDate,
        estimatedDelivery: base.estimatedDelivery ?? fromPdf.estimatedDelivery,
        category: base.category ?? fromPdf.category,
    };
}
function buildPdfUserPrompt(email, existing) {
    const known = [];
    if (isPresentString(existing.shop))
        known.push(`Händler: ${existing.shop}`);
    if (existing.price != null)
        known.push(`Preis: ${existing.price} ${existing.currency ?? 'EUR'}`);
    if (isPresentString(existing.deliveryAddress))
        known.push(`Lieferadresse: ${existing.deliveryAddress}`);
    if (isPresentString(existing.orderNumber))
        known.push(`Bestellnummer: ${existing.orderNumber}`);
    return [
        'Kontext der zugehörigen E-Mail:',
        `Betreff: ${email.subject}`,
        `Absender: ${email.from}`,
        `Datum: ${email.date.toISOString()}`,
        known.length ? `\nBereits aus der E-Mail bekannt:\n${known.join('\n')}` : '',
        `\nBitte aus dem PDF ergänzen (fehlen noch): ${listMissingFields(existing).join(', ')}`,
    ].join('\n');
}
async function analyzePdfAttachment(openai, pdf, email, existing) {
    if (pdf.data.byteLength > MAX_PDF_BYTES) {
        console.warn(`PDF ${pdf.filename} überspringen: ${pdf.data.byteLength} Bytes > Limit`);
        return null;
    }
    let uploadedId;
    try {
        const uploaded = await openai.files.create({
            file: await (0, openai_1.toFile)(pdf.data, pdf.filename, { type: 'application/pdf' }),
            purpose: 'user_data',
        });
        uploadedId = uploaded.id;
        const userContent = [
            { type: 'file', file: { file_id: uploaded.id } },
            { type: 'text', text: buildPdfUserPrompt(email, existing) },
        ];
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: PDF_SYSTEM_PROMPT },
                { role: 'user', content: userContent },
            ],
            temperature: 0,
            max_tokens: 500,
            response_format: { type: 'json_object' },
        });
        const text = response.choices[0]?.message?.content?.trim();
        if (!text)
            return null;
        const parsed = parseOrderInfoJson(text);
        return parsed?.isOrder ? parsed : null;
    }
    catch (err) {
        console.error(`PDF-Analyse fehlgeschlagen (${pdf.filename}):`, err);
        return null;
    }
    finally {
        if (uploadedId) {
            await openai.files.del(uploadedId).catch(() => { });
        }
    }
}
/**
 * Einmalige PDF-Nachanalyse, wenn die E-Mail eine Bestellung ist,
 * aber wichtige Felder (Händler, Preis, Lieferadresse) fehlen.
 */
async function enrichOrderInfoFromPdfs(email, info) {
    if (!needsPdfSupplement(info))
        return info;
    const pdfs = (email.attachments ?? []).filter(a => a.mimeType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0)
        return info;
    const openai = getOpenAI();
    if (!openai)
        return info;
    let merged = info;
    for (const pdf of pdfs.slice(0, MAX_PDFS_PER_EMAIL)) {
        if (!needsPdfSupplement(merged))
            break;
        const fromPdf = await analyzePdfAttachment(openai, pdf, email, merged);
        if (fromPdf) {
            merged = mergeOrderInfo(merged, fromPdf);
        }
    }
    if (merged !== info) {
        console.log(`PDF-Nachanalyse für "${email.subject}": fehlende Felder ergänzt`);
    }
    return merged;
}
// ─── Einzel-Analyse (Delta-Sync oder Fallback) ────────────────────────────────
async function analyzeEmailForOrder(email) {
    const openai = getOpenAI();
    if (openai) {
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: exports.SYSTEM_PROMPT },
                    { role: 'user', content: buildUserContent(email) },
                ],
                temperature: 0,
                max_tokens: 500,
                response_format: { type: 'json_object' },
            });
            const text = response.choices[0]?.message?.content?.trim();
            if (text) {
                const parsed = parseOrderInfoJson(text);
                if (parsed)
                    return enrichOrderInfoFromPdfs(email, parsed);
            }
        }
        catch (err) {
            console.error('OpenAI-Fehler, verwende Fallback:', err);
        }
    }
    return enrichOrderInfoFromPdfs(email, fallbackAnalysis(email));
}
// ─── Batch-Analyse (Vollsync, ≥ BATCH_THRESHOLD E-Mails) ─────────────────────
/** Ab dieser Anzahl E-Mails wird die Batch API genutzt (50 % Rabatt) */
const BATCH_THRESHOLD = 5;
/** Maximale E-Mails pro Batch-Request */
const BATCH_MAX_EMAILS = 50;
/** Maximale Wartezeit auf Batch-Ergebnis in Millisekunden (8 Minuten) */
const BATCH_TIMEOUT_MS = 8 * 60 * 1000;
/**
 * Analysiert mehrere E-Mails via OpenAI Batch API (50 % günstiger).
 * Bei < BATCH_THRESHOLD E-Mails oder Fehler: automatischer Fallback auf Einzel-Anfragen.
 *
 * @returns Map von email.uid → OrderInfo
 */
async function analyzeEmailsBatch(emails, onProgress) {
    const results = new Map();
    if (emails.length === 0)
        return results;
    const openai = getOpenAI();
    const report = (current) => onProgress?.(current, emails.length);
    // Wenige E-Mails oder kein API-Key → sequenziell verarbeiten
    if (!openai || emails.length < BATCH_THRESHOLD) {
        let done = 0;
        for (const email of emails) {
            results.set(email.uid, await analyzeEmailForOrder(email));
            done++;
            report(done);
        }
        return results;
    }
    // Auf maximal BATCH_MAX_EMAILS begrenzen
    const emailsToProcess = emails.slice(0, BATCH_MAX_EMAILS);
    if (emails.length > BATCH_MAX_EMAILS) {
        console.log(`Batch begrenzt auf ${BATCH_MAX_EMAILS} E-Mails (von ${emails.length} gesamt)`);
    }
    // custom_id darf nur alphanumerisch + - _ sein (max 64 Zeichen)
    const toCustomId = (uid) => Buffer.from(uid).toString('base64url').slice(0, 64);
    const fromCustomId = new Map(emailsToProcess.map(e => [toCustomId(e.uid), e.uid]));
    try {
        // 1. JSONL-Datei mit allen Anfragen erstellen (gpt-4o-mini: zuverlässiges JSON, 50 % Batch-Rabatt)
        const jsonlLines = emailsToProcess.map(email => JSON.stringify({
            custom_id: toCustomId(email.uid),
            method: 'POST',
            url: '/v1/chat/completions',
            body: {
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: exports.SYSTEM_PROMPT },
                    { role: 'user', content: buildUserContent(email) },
                ],
                temperature: 0,
                max_tokens: 500,
                response_format: { type: 'json_object' },
            },
        }));
        const jsonlContent = jsonlLines.join('\n');
        console.log(`OpenAI Batch: ${emailsToProcess.length} E-Mails werden als Batch verarbeitet...`);
        // 2. Datei hochladen
        const uploadedFile = await openai.files.create({
            file: await (0, openai_1.toFile)(Buffer.from(jsonlContent), 'emails.jsonl', { type: 'application/jsonl' }),
            purpose: 'batch',
        });
        // 3. Batch erstellen
        const batchJob = await openai.batches.create({
            input_file_id: uploadedFile.id,
            endpoint: '/v1/chat/completions',
            completion_window: '24h',
        });
        console.log(`OpenAI Batch erstellt: ${batchJob.id} (${emailsToProcess.length} Anfragen)`);
        // 4. Auf Ergebnis warten (Polling)
        const deadline = Date.now() + BATCH_TIMEOUT_MS;
        let currentBatch = batchJob;
        while (!['completed', 'failed', 'cancelled', 'expired'].includes(currentBatch.status)) {
            if (Date.now() > deadline) {
                console.warn(`OpenAI Batch Timeout nach ${BATCH_TIMEOUT_MS / 1000}s – Fallback auf Einzel-Anfragen`);
                await openai.batches.cancel(currentBatch.id).catch(() => { });
                await openai.files.del(uploadedFile.id).catch(() => { });
                let done = 0;
                for (const email of emailsToProcess) {
                    if (!results.has(email.uid)) {
                        results.set(email.uid, await analyzeEmailForOrder(email));
                    }
                    done++;
                    report(done);
                }
                return results;
            }
            const completed = currentBatch.request_counts?.completed ?? 0;
            const total = currentBatch.request_counts?.total ?? emailsToProcess.length;
            console.log(`OpenAI Batch ${currentBatch.id}: ${currentBatch.status} (${completed}/${total})`);
            report(completed);
            await new Promise(resolve => setTimeout(resolve, 6000));
            currentBatch = await openai.batches.retrieve(currentBatch.id);
        }
        if (currentBatch.status !== 'completed' || !currentBatch.output_file_id) {
            throw new Error(`Batch endete mit Status: ${currentBatch.status}`);
        }
        // 5. Ergebnisse herunterladen und parsen
        const outputResponse = await openai.files.content(currentBatch.output_file_id);
        const outputText = await outputResponse.text();
        let parseErrors = 0;
        for (const line of outputText.split('\n').filter(Boolean)) {
            try {
                const item = JSON.parse(line);
                const customId = item.custom_id;
                const originalUid = fromCustomId.get(customId) ?? customId;
                // HTTP-Fehler in der Batch-Antwort loggen
                if (item.response?.status_code && item.response.status_code >= 400) {
                    console.warn(`Batch-Fehler für ${originalUid}: HTTP ${item.response.status_code}`, item.error);
                    parseErrors++;
                    continue;
                }
                const content = item.response?.body?.choices?.[0]?.message?.content?.trim();
                if (content) {
                    const parsed = parseOrderInfoJson(content);
                    if (parsed) {
                        results.set(originalUid, parsed);
                    }
                    else {
                        parseErrors++;
                    }
                }
            }
            catch {
                parseErrors++;
            }
        }
        console.log(`OpenAI Batch abgeschlossen: ${results.size}/${emails.length} Ergebnisse, ${parseErrors} Fehler`);
        report(emailsToProcess.length);
        // 6. Hochgeladene Dateien bereinigen
        await openai.files.del(uploadedFile.id).catch(() => { });
        await openai.files.del(currentBatch.output_file_id).catch(() => { });
        if (currentBatch.error_file_id) {
            await openai.files.del(currentBatch.error_file_id).catch(() => { });
        }
    }
    catch (err) {
        console.error('OpenAI Batch fehlgeschlagen, verwende Einzel-Anfragen:', err);
    }
    // Fehlende Ergebnisse (Fehler in einzelnen Anfragen) nachfüllen
    let done = results.size;
    for (const email of emails) {
        if (!results.has(email.uid)) {
            results.set(email.uid, await analyzeEmailForOrder(email));
            done++;
            report(done);
        }
    }
    if (results.size >= emails.length) {
        report(emails.length);
    }
    // PDF-Nachanalyse für Bestellungen mit fehlenden Kernfeldern
    const emailByUid = new Map(emails.map(e => [e.uid, e]));
    for (const [uid, info] of results) {
        const email = emailByUid.get(uid);
        if (email) {
            results.set(uid, await enrichOrderInfoFromPdfs(email, info));
        }
    }
    return results;
}
//# sourceMappingURL=openai.js.map