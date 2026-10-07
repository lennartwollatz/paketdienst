"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DhlWebTrackingProvider = void 0;
exports.buildDhlTrackingPageUrl = buildDhlTrackingPageUrl;
exports.extractDataPathFromHtml = extractDataPathFromHtml;
exports.extractSendungsverlauf = extractSendungsverlauf;
exports.fetchDhlTrackingFromWeb = fetchDhlTrackingFromWeb;
const dhlStatusAnalysis_1 = require("../dhlStatusAnalysis");
const types_1 = require("../types");
const DHL_TRACKING_PAGE_BASE = 'https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html';
const DEFAULT_DATA_PATH = '/int-verfolgen/data';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
function buildDhlTrackingPageUrl(trackingNumber) {
    return `${DHL_TRACKING_PAGE_BASE}?piececode=${encodeURIComponent(trackingNumber)}`;
}
function buildTrackingDataUrl(dataPath, trackingNumber) {
    const params = new URLSearchParams({
        piececode: trackingNumber,
        noRedirect: 'true',
        language: 'de',
    });
    return `https://www.dhl.de${dataPath}/search?${params.toString()}`;
}
function parseDhlGermanDate(raw) {
    const trimmed = raw.trim();
    const deMatch = trimmed.match(/(?:[A-Za-zäöüÄÖÜ]{2,3},?\s+)?(\d{2})\.(\d{2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
    if (deMatch) {
        const [, day, month, year, hour = '12', minute = '0'] = deMatch;
        return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime()))
        return parsed;
    return new Date();
}
function selectShipment(data) {
    const sendungen = data.sendungen ?? [];
    if (sendungen.length === 0)
        return null;
    return sendungen.find((s) => s.hasCompleteDetails) ?? sendungen[0];
}
/**
 * Liest den Datenpfad aus dem HTML der DHL-Sendungsverfolgungsseite.
 * Die Webseite bindet ein React-Widget ein, das seine Daten von dort lädt.
 */
function extractDataPathFromHtml(html) {
    const match = html.match(/data-nolp-data-path="([^"]+)"/);
    return match?.[1] ?? DEFAULT_DATA_PATH;
}
/**
 * Extrahiert den Detaillierten Sendungsverlauf aus den Webdaten.
 */
function extractSendungsverlauf(data) {
    const shipment = selectShipment(data);
    const verlauf = shipment?.sendungsdetails?.sendungsverlauf;
    if (!verlauf)
        return null;
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
        text: `Detaillierter Sendungsverlauf:\n${lines.join('\n')}`,
        events,
        kurzStatus: verlauf.kurzStatus,
    };
}
function collectCookies(response, existing) {
    const cookies = [...existing];
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
    for (const cookie of setCookies) {
        const pair = cookie.split(';')[0]?.trim();
        if (!pair)
            continue;
        const name = pair.split('=')[0];
        const idx = cookies.findIndex((c) => c.startsWith(`${name}=`));
        if (idx >= 0)
            cookies[idx] = pair;
        else
            cookies.push(pair);
    }
    return cookies;
}
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Ruft die DHL-Sendungsverfolgungswebseite auf und lädt die zugehörigen Tracking-Daten,
 * die die Seite clientseitig nachlädt.
 */
async function fetchDhlTrackingFromWeb(trackingNumber) {
    const pageUrl = buildDhlTrackingPageUrl(trackingNumber);
    const timeoutMs = Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000);
    let cookies = [];
    let pageResponse;
    try {
        pageResponse = await fetchWithTimeout(pageUrl, {
            method: 'GET',
            headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9',
            },
            redirect: 'follow',
        }, timeoutMs);
    }
    catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        throw new types_1.TrackingProviderError('dhl-web', isAbort ? 'timeout' : 'network', `DHL-Webseite nicht erreichbar: ${String(err)}`);
    }
    cookies = collectCookies(pageResponse, cookies);
    const pageHtml = await pageResponse.text();
    if (!pageResponse.ok) {
        throw new types_1.TrackingProviderError('dhl-web', 'network', `DHL-Webseite nicht erreichbar: HTTP ${pageResponse.status}`);
    }
    const dataPath = extractDataPathFromHtml(pageHtml);
    const dataUrl = buildTrackingDataUrl(dataPath, trackingNumber);
    let dataResponse;
    try {
        dataResponse = await fetchWithTimeout(dataUrl, {
            method: 'GET',
            headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'de-DE,de;q=0.9',
                'Referer': pageUrl,
                ...(cookies.length > 0 ? { Cookie: cookies.join('; ') } : {}),
            },
            redirect: 'follow',
        }, timeoutMs);
    }
    catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        throw new types_1.TrackingProviderError('dhl-web', isAbort ? 'timeout' : 'network', `DHL-Tracking-Daten nicht erreichbar: ${String(err)}`);
    }
    const body = await dataResponse.text();
    if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
        throw new types_1.TrackingProviderError('dhl-web', 'network', 'DHL lieferte keine Tracking-Daten (Bot-Schutz oder ungültige Antwort)');
    }
    if (!dataResponse.ok) {
        throw new types_1.TrackingProviderError('dhl-web', dataResponse.status === 404 ? 'not_found' : 'unknown', `DHL-Tracking-Daten nicht verfügbar: HTTP ${dataResponse.status}`);
    }
    try {
        return {
            pageUrl,
            dataPath,
            rawData: JSON.parse(body),
        };
    }
    catch {
        throw new types_1.TrackingProviderError('dhl-web', 'unknown', 'DHL-Webdaten sind kein gültiges JSON');
    }
}
function mapEventsToTrackingEvents(events, overallStatus) {
    return events.map((event) => ({
        timestamp: event.timestamp,
        location: event.location,
        status: overallStatus,
        description: event.description,
    }));
}
/**
 * DHL-Web-Tracking:
 * 1. Webseite mit Sendungsnummer abrufen
 * 2. Sendungsverlauf programmatisch extrahieren
 * 3. Extrahierte Informationen an ChatGPT senden, um den Status zu ermitteln
 */
class DhlWebTrackingProvider {
    providerName = 'dhl-web';
    carrierKeys = ['dhl', 'deutsche post', 'deutschepost'];
    isConfigured() {
        return true;
    }
    async fetchTracking(trackingNumber) {
        const { rawData } = await fetchDhlTrackingFromWeb(trackingNumber);
        const extracted = extractSendungsverlauf(rawData);
        if (!extracted || (!extracted.text.trim() && extracted.events.length === 0)) {
            throw new types_1.TrackingProviderError('dhl-web', 'not_found', `Kein Sendungsverlauf für ${trackingNumber} gefunden`);
        }
        const analysis = await (0, dhlStatusAnalysis_1.analyzeDhlTrackingStatus)(extracted.text);
        const trackingEvents = mapEventsToTrackingEvents(extracted.events, analysis.status);
        const zustelldatum = selectShipment(rawData)?.sendungsdetails?.zustellung?.zustelldatum;
        const estimatedDelivery = zustelldatum ? parseDhlGermanDate(zustelldatum) : undefined;
        if (analysis.reasoning) {
            console.log(`[DHL Web] ChatGPT-Status für ${trackingNumber}: ${analysis.status} – ${analysis.reasoning}`);
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
exports.DhlWebTrackingProvider = DhlWebTrackingProvider;
//# sourceMappingURL=dhlWeb.js.map