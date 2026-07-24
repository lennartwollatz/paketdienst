import OpenAI from 'openai';
import { InternalTrackingStatus } from './types';
import { internalStatusToDb } from './normalization';

export interface DhlStatusAnalysisResult {
  internalStatus: InternalTrackingStatus;
  status: string;
  reasoning?: string;
}

const VALID_INTERNAL_STATUSES: InternalTrackingStatus[] = [
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

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'sk-PLACEHOLDER') return null;
  return new OpenAI({ apiKey: key });
}

function parseAnalysisResponse(text: string): DhlStatusAnalysisResult | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      internalStatus?: string;
      reasoning?: string;
    };
    if (!parsed.internalStatus || !VALID_INTERNAL_STATUSES.includes(parsed.internalStatus as InternalTrackingStatus)) {
      return null;
    }
    const internalStatus = parsed.internalStatus as InternalTrackingStatus;
    return {
      internalStatus,
      status: internalStatusToDb(internalStatus),
      reasoning: parsed.reasoning,
    };
  } catch {
    return null;
  }
}

/** Regelbasierter Fallback, wenn OpenAI nicht verfügbar ist. */
export function analyzeDhlStatusFallback(sendungsverlaufText: string): DhlStatusAnalysisResult {
  const text = sendungsverlaufText.toLowerCase();

  if (/zugestellt|erfolgreich (aus)?geliefert|abgeholt|delivery successful/i.test(text)) {
    return { internalStatus: 'delivered', status: internalStatusToDb('delivered') };
  }
  if (/packstation|paketshop|abholstation|bereit zur abholung|parcel locker/i.test(text)) {
    return { internalStatus: 'in_packstation', status: internalStatusToDb('in_packstation') };
  }
  if (/elektronisch angekündigt|auftragsdaten|noch nicht|wird bearbeitet/i.test(text)
    && !/versandt|unterwegs|transport|region des empfängers|zustellung/i.test(text)) {
    return { internalStatus: 'info_received', status: internalStatusToDb('info_received') };
  }
  return { internalStatus: 'in_transit', status: internalStatusToDb('in_transit') };
}

/**
 * Sendet den programmatisch extrahierten Sendungsverlauf an ChatGPT,
 * um den aktuellen Lieferstatus zu ermitteln.
 */
export async function analyzeDhlTrackingStatus(
  sendungsverlaufText: string,
): Promise<DhlStatusAnalysisResult> {
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
      if (parsed) return parsed;
    }
  } catch (err) {
    console.error('[DHL Web] KI-Statusanalyse fehlgeschlagen:', err);
  }

  return analyzeDhlStatusFallback(sendungsverlaufText);
}
