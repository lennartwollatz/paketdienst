import OpenAI, { toFile } from 'openai';
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

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'sk-PLACEHOLDER') return null;
  return new OpenAI({ apiKey: key });
}

const CARRIERS: Record<string, string[]> = {
  DHL: ['dhl', 'deutsche post'],
  Hermes: ['hermes', 'evri'],
  DPD: ['dpd'],
  UPS: ['ups'],
  FedEx: ['fedex', 'fed ex'],
  GLS: ['gls'],
  Amazon: ['amazon logistics', 'amazon'],
};

function detectCarrierFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [carrier, keywords] of Object.entries(CARRIERS)) {
    if (keywords.some(kw => lower.includes(kw))) return carrier;
  }
  return undefined;
}

function extractTrackingNumberFallback(text: string): string | undefined {
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
    if (match) return match[1] || match[0];
  }
  return undefined;
}

function extractOrderNumberFallback(text: string): string | undefined {
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
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractPriceFallback(text: string): { price?: number; currency?: string } {
  const match = text.match(/(\d+[.,]\d{2})\s*(€|EUR|USD|\$)/);
  if (match) {
    const price = parseFloat(match[1].replace(',', '.'));
    const currency = match[2] === '€' ? 'EUR' : match[2] === '$' ? 'USD' : match[2];
    return { price, currency };
  }
  return {};
}

/** Regelbasierter Fallback wenn OpenAI nicht verfügbar ist */
function fallbackAnalysis(email: EmailMessage): OrderInfo {
  const lower = (email.subject + ' ' + email.text).toLowerCase();
  const isOrderKeyword = [
    'bestellung', 'order', 'bestätigung', 'confirmation',
    'rechnung', 'invoice', 'versand', 'shipping', 'lieferung', 'delivery',
    'sendungsnummer', 'tracking', 'paket',
  ].some(kw => lower.includes(kw));

  if (!isOrderKeyword) return { isOrder: false };

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

export const SYSTEM_PROMPT = `Du bist ein Assistent, der E-Mails auf Bestellinformationen analysiert.

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
  "orderDate": string | null
}`;

/**
 * Bereinigt den Plaintext einer E-Mail, um Tokens zu sparen:
 * - HTML-Tags und -Entities entfernen
 * - Mehrfache Leerzeichen → einzelnes Leerzeichen
 * - Führende/nachfolgende Leerzeichen pro Zeile
 * - Reine Trennzeilen (----, ====, …) entfernen
 * - Mehr als zwei aufeinanderfolgende Leerzeilen auf eine reduzieren
 */
function cleanEmailText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')           // HTML-Tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')            // numerische HTML-Entities
    .replace(/[^\S\n]+/g, ' ')          // mehrfache Leerzeichen (kein Zeilenumbruch)
    .split('\n')
    .map(l => l.trim())
    .filter(l => !/^[-=_*#|~]{3,}$/.test(l)) // Trennzeilen
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')         // max. zwei aufeinanderfolgende Leerzeilen
    .trim();
}

function buildUserContent(email: EmailMessage): string {
  const body = cleanEmailText(email.text);
  return `Betreff: ${email.subject}\nAbsender: ${email.from}\nDatum: ${email.date.toISOString()}\n\n${body}`;
}

function parseOrderInfoJson(text: string): OrderInfo | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as OrderInfo;
  } catch {}
  return null;
}

// ─── Einzel-Analyse (Delta-Sync oder Fallback) ────────────────────────────────

export async function analyzeEmailForOrder(email: EmailMessage): Promise<OrderInfo> {
  const openai = getOpenAI();

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserContent(email) },
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0]?.message?.content?.trim();
      console.log(`\n── GPT Einzel-Antwort [${email.uid}] ──`);
      console.log(text ?? '(kein Inhalt)');
      if (text) {
        const parsed = parseOrderInfoJson(text);
        if (parsed) {
          console.log('✓ Parsed:', JSON.stringify(parsed));
          return parsed;
        }
        console.warn('✗ JSON-Parse fehlgeschlagen');
      }
    } catch (err) {
      console.error('OpenAI-Fehler, verwende Fallback:', err);
    }
  }

  return fallbackAnalysis(email);
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
export async function analyzeEmailsBatch(
  emails: EmailMessage[],
): Promise<Map<string, OrderInfo>> {
  const results = new Map<string, OrderInfo>();
  if (emails.length === 0) return results;

  const openai = getOpenAI();

  // Wenige E-Mails oder kein API-Key → sequenziell verarbeiten
  if (!openai || emails.length < BATCH_THRESHOLD) {
    for (const email of emails) {
      results.set(email.uid, await analyzeEmailForOrder(email));
    }
    return results;
  }

  // Auf maximal BATCH_MAX_EMAILS begrenzen
  const emailsToProcess = emails.slice(0, BATCH_MAX_EMAILS);
  if (emails.length > BATCH_MAX_EMAILS) {
    console.log(`Batch begrenzt auf ${BATCH_MAX_EMAILS} E-Mails (von ${emails.length} gesamt)`);
  }

  // custom_id darf nur alphanumerisch + - _ sein (max 64 Zeichen)
  const toCustomId = (uid: string) =>
    Buffer.from(uid).toString('base64url').slice(0, 64);
  const fromCustomId = new Map(emailsToProcess.map(e => [toCustomId(e.uid), e.uid]));

  try {
    // 1. JSONL-Datei mit allen Anfragen erstellen (gpt-4o-mini: zuverlässiges JSON, 50 % Batch-Rabatt)
    const jsonlLines = emailsToProcess.map(email =>
      JSON.stringify({
        custom_id: toCustomId(email.uid),
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserContent(email) },
          ],
          temperature: 0,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        },
      }),
    );
    const jsonlContent = jsonlLines.join('\n');

    console.log(`OpenAI Batch: ${emailsToProcess.length} E-Mails werden als Batch verarbeitet...`);

    // 2. Datei hochladen
    const uploadedFile = await openai.files.create({
      file: await toFile(Buffer.from(jsonlContent), 'emails.jsonl', { type: 'application/jsonl' }),
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
        await openai.batches.cancel(currentBatch.id).catch(() => {});
        await openai.files.del(uploadedFile.id).catch(() => {});
        for (const email of emailsToProcess) {
          if (!results.has(email.uid)) {
            results.set(email.uid, await analyzeEmailForOrder(email));
          }
        }
        return results;
      }

      const completed = currentBatch.request_counts?.completed ?? 0;
      const total = currentBatch.request_counts?.total ?? emailsToProcess.length;
      console.log(`OpenAI Batch ${currentBatch.id}: ${currentBatch.status} (${completed}/${total})`);

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
        const customId = item.custom_id as string;
        const originalUid = fromCustomId.get(customId) ?? customId;

        // HTTP-Fehler in der Batch-Antwort loggen
        if (item.response?.status_code && item.response.status_code >= 400) {
          console.warn(`Batch-Fehler für ${originalUid}: HTTP ${item.response.status_code}`, item.error);
          parseErrors++;
          continue;
        }

        const content: string | undefined =
          item.response?.body?.choices?.[0]?.message?.content?.trim();

        // GPT-Antwort auf der Konsole ausgeben
        console.log(`\n── GPT Antwort [${originalUid}] ──`);
        console.log(content ?? '(kein Inhalt)');

        if (content) {
          const parsed = parseOrderInfoJson(content);
          if (parsed) {
            console.log('✓ Parsed:', JSON.stringify(parsed));
            results.set(originalUid, parsed);
          } else {
            console.warn(`✗ JSON-Parse fehlgeschlagen:`, content.slice(0, 300));
            parseErrors++;
          }
        }
      } catch (lineErr) {
        parseErrors++;
        console.warn('Batch-Zeile konnte nicht geparst werden:', lineErr);
      }
    }

    console.log(`OpenAI Batch abgeschlossen: ${results.size}/${emails.length} Ergebnisse, ${parseErrors} Fehler`);

    // 6. Hochgeladene Dateien bereinigen
    await openai.files.del(uploadedFile.id).catch(() => {});
    await openai.files.del(currentBatch.output_file_id).catch(() => {});
    if (currentBatch.error_file_id) {
      await openai.files.del(currentBatch.error_file_id).catch(() => {});
    }

  } catch (err) {
    console.error('OpenAI Batch fehlgeschlagen, verwende Einzel-Anfragen:', err);
  }

  // Fehlende Ergebnisse (Fehler in einzelnen Anfragen) nachfüllen
  for (const email of emails) {
    if (!results.has(email.uid)) {
      results.set(email.uid, await analyzeEmailForOrder(email));
    }
  }

  return results;
}
