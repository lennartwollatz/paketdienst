import { analyzeDhlTrackingStatus } from '../dhlStatusAnalysis';
import { internalStatusToDb } from '../normalization';
import { TrackingEvent, TrackingProvider, TrackingProviderError, TrackingResult } from '../types';

const DHL_TRACKING_PAGE_BASE =
  'https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html';
const DHL_DATA_API_BASE = 'https://www.dhl.de/int-verfolgen/data/search';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface DhlWebEvent {
  datum?: string;
  status?: string;
  ort?: string;
  location?: string;
}

interface DhlWebSendungsverlauf {
  kurzStatus?: string;
  events?: DhlWebEvent[];
}

interface DhlWebSendung {
  id?: string;
  hasCompleteDetails?: boolean;
  sendungsdetails?: {
    sendungsverlauf?: DhlWebSendungsverlauf;
    zustellung?: {
      zustelldatum?: string;
    };
  };
}

interface DhlWebSearchResponse {
  sendungen?: DhlWebSendung[];
}

export interface ExtractedDhlSendungsverlauf {
  text: string;
  events: Array<{ timestamp: Date; location: string; description: string }>;
  kurzStatus?: string;
}

export function buildDhlTrackingPageUrl(trackingNumber: string): string {
  return `${DHL_TRACKING_PAGE_BASE}?piececode=${encodeURIComponent(trackingNumber)}`;
}

function buildDhlDataApiUrl(trackingNumber: string): string {
  const params = new URLSearchParams({
    piececode: trackingNumber,
    noRedirect: 'true',
    language: 'de',
  });
  return `${DHL_DATA_API_BASE}?${params.toString()}`;
}

function parseDhlGermanDate(raw: string): Date {
  const trimmed = raw.trim();

  const deMatch = trimmed.match(
    /(?:[A-Za-zäöüÄÖÜ]{2,3},?\s+)?(\d{2})\.(\d{2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/,
  );
  if (deMatch) {
    const [, day, month, year, hour = '12', minute = '0'] = deMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function selectShipment(data: DhlWebSearchResponse): DhlWebSendung | null {
  const sendungen = data.sendungen ?? [];
  if (sendungen.length === 0) return null;
  return sendungen.find((s) => s.hasCompleteDetails) ?? sendungen[0];
}

/**
 * Extrahiert den Detaillierten Sendungsverlauf aus der DHL-JSON-Antwort.
 */
export function extractSendungsverlauf(data: DhlWebSearchResponse): ExtractedDhlSendungsverlauf | null {
  const shipment = selectShipment(data);
  const verlauf = shipment?.sendungsdetails?.sendungsverlauf;
  if (!verlauf) return null;

  const rawEvents = verlauf.events ?? [];
  const events = rawEvents.map((event) => {
    const description = (event.status ?? '').trim();
    const location = (event.ort ?? event.location ?? '').trim();
    return {
      timestamp: parseDhlGermanDate(event.datum ?? ''),
      location,
      description,
    };
  });

  const lines = events.map((event) => {
    const datePart = event.timestamp.toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const locationPart = event.location ? `, ${event.location}` : '';
    return `- ${datePart}${locationPart}: ${event.description}`;
  });

  if (verlauf.kurzStatus && lines.length === 0) {
    lines.push(`- Aktueller Status: ${verlauf.kurzStatus}`);
  }

  return {
    text: lines.join('\n'),
    events,
    kurzStatus: verlauf.kurzStatus,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDhlTrackingData(trackingNumber: string): Promise<DhlWebSearchResponse> {
  const pageUrl = buildDhlTrackingPageUrl(trackingNumber);
  const apiUrl = buildDhlDataApiUrl(trackingNumber);
  const timeoutMs = Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000);

  try {
    // Referer-Seite laden (Session/Cookies), wie ein normaler Browser-Besuch
    await fetchWithTimeout(pageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
      redirect: 'follow',
    }, timeoutMs);
  } catch {
    // Referer-Aufruf ist best-effort – die Daten-API wird trotzdem versucht
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Referer': pageUrl,
      },
      redirect: 'follow',
    }, timeoutMs);
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new TrackingProviderError(
      'dhl-web',
      isAbort ? 'timeout' : 'network',
      `DHL-Webseite nicht erreichbar: ${String(err)}`,
    );
  }

  const body = await response.text();

  if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
    throw new TrackingProviderError(
      'dhl-web',
      'network',
      'DHL lieferte keine Tracking-Daten (Bot-Schutz oder ungültige Antwort)',
    );
  }

  if (!response.ok) {
    throw new TrackingProviderError(
      'dhl-web',
      response.status === 404 ? 'not_found' : 'unknown',
      `DHL-Datenabfrage fehlgeschlagen: HTTP ${response.status}`,
    );
  }

  try {
    return JSON.parse(body) as DhlWebSearchResponse;
  } catch {
    throw new TrackingProviderError('dhl-web', 'unknown', 'DHL-Antwort ist kein gültiges JSON');
  }
}

function mapEventsToTrackingEvents(
  events: ExtractedDhlSendungsverlauf['events'],
  overallStatus: string,
): TrackingEvent[] {
  return events.map((event) => ({
    timestamp: event.timestamp,
    location: event.location,
    status: overallStatus,
    description: event.description,
  }));
}

/**
 * DHL-Web-Tracking: Statischer HTTP-Abruf der DHL-Sendungsverfolgung,
 * programmatische Extraktion des Sendungsverlaufs, KI-basierte Statuszuordnung.
 */
export class DhlWebTrackingProvider implements TrackingProvider {
  readonly providerName = 'dhl-web';
  readonly carrierKeys = ['dhl', 'deutsche post', 'deutschepost'];

  isConfigured(): boolean {
    return true;
  }

  async fetchTracking(trackingNumber: string): Promise<TrackingResult> {
    const data = await fetchDhlTrackingData(trackingNumber);
    const extracted = extractSendungsverlauf(data);

    if (!extracted || (!extracted.text.trim() && extracted.events.length === 0)) {
      throw new TrackingProviderError(
        'dhl-web',
        'not_found',
        `Kein Sendungsverlauf für ${trackingNumber} gefunden`,
      );
    }

    const analysis = await analyzeDhlTrackingStatus(extracted.text);
    const trackingEvents = mapEventsToTrackingEvents(extracted.events, analysis.status);

    const zustelldatum = selectShipment(data)?.sendungsdetails?.zustellung?.zustelldatum;
    const estimatedDelivery = zustelldatum ? parseDhlGermanDate(zustelldatum) : undefined;

    if (analysis.reasoning) {
      console.log(`[DHL Web] Status für ${trackingNumber}: ${analysis.status} – ${analysis.reasoning}`);
    }

    return {
      provider: this.providerName,
      internalStatus: analysis.internalStatus,
      status: analysis.status,
      events: trackingEvents,
      estimatedDelivery,
      detectedCarrier: 'DHL',
    };
  }
}
