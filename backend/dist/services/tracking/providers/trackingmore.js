"use strict";
/**
 * TrackingMore – universeller Tracking-Provider via offizielles Node.js SDK
 *
 * SDK:  https://github.com/TrackingMore-API/trackingmore-sdk-nodejs
 * API:  https://api.trackingmore.com/v4
 * Auth: Header "Tracking-Api-Key: <key>"
 *
 * Ablauf:
 *  1. Carrier-Code ermitteln:
 *     a) Aus internem Mapping (kein API-Aufruf nötig)
 *     b) Fallback: couriers/detect API
 *  2. createTracking – registriert die Sendungsnummer (4101 = bereits bekannt, wird ignoriert)
 *  3. GET /v4/trackings/get – aktueller Status + Checkpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackingMoreProvider = void 0;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackingMoreSDK = require('trackingmore-sdk-nodejs');
const normalization_1 = require("../normalization");
const types_1 = require("../types");
// ─── Carrier-Code-Mapping ─────────────────────────────────────────────────────
// Interne Carrier-Bezeichnungen → TrackingMore courier_code (v4)
const CARRIER_CODE_MAP = {
    'dhl': 'dhl',
    'dhl-germany': 'dhl-germany',
    'dhl germany': 'dhl-germany',
    'dhl paket': 'dhl-germany',
    'dhl express': 'dhl',
    'deutsche-post': 'deutsche-post',
    'deutsche post': 'deutsche-post',
    'deutschepost': 'deutsche-post',
    'ups': 'ups',
    'hermes': 'hermes-germany',
    'hermes-germany': 'hermes-germany',
    'hermesworld': 'hermes-germany',
    'myhermes': 'hermes-germany',
    'dpd': 'dpd',
    'dpd-germany': 'dpd',
    'gls': 'gls',
    'gls-germany': 'gls',
    'fedex': 'fedex',
    'amazon': 'amazon',
    'amazon-logistics': 'amazon',
    'amazon logistics': 'amazon',
    'postnl': 'postnl',
    'post-nl': 'postnl',
    'evri': 'evri',
    'tnt': 'tnt',
    'schenker': 'db-schenker',
    'db-schenker': 'db-schenker',
    'chronopost': 'chronopost',
};
// ─── Status-Mapping v4 ────────────────────────────────────────────────────────
// Quelle: https://www.trackingmore.com/docs/trackingmore/ob4s40k11o6t0-courier-delivery-status
//
// Hauptstatus:
//  pending       → Paket wartet auf Abholung durch Kurier                    → info_received
//  inforeceived  → Kurier hat Paketinfo empfangen, steht kurz vor Abholung   → info_received
//  transit       → Paket ist unterwegs zum Empfänger                         → in_transit
//  pickup        → Paket ist zur Zustellung oder Abholung bereit              → in_transit (*)
//  undelivered   → Zustellversuch fehlgeschlagen, Wiederholung geplant        → in_transit
//  delivered     → Paket wurde erfolgreich zugestellt                         → delivered
//  exception     → Rücksendung, Beschädigung, Verlust oder sonstige Ausnahme → in_transit (**)
//  expired       → Keine Aktualisierung seit 30/60 Tagen                     → unknown
//  notfound      → Keine Tracking-Infos verfügbar                             → unknown
//
// (*) Sub-Status pickup002 = „ready for collection" an Packstation            → in_packstation
// (**) Sub-Status exception010 = erfolgreich an Absender zurückgesendet       → delivered
const TM_MAIN_STATUS_MAP = {
    pending: 'info_received',
    inforeceived: 'info_received',
    transit: 'in_transit',
    pickup: 'in_transit', // pickup002 wird via Sub-Status als in_packstation behandelt
    undelivered: 'in_transit',
    delivered: 'delivered',
    exception: 'in_transit',
    expired: 'unknown',
    notfound: 'unknown',
};
// Sub-Status-Overrides – werden nach dem Hauptstatus angewendet
const TM_SUBSTATUS_MAP = {
    // Info Received
    inforeceived001: 'info_received',
    // In Transit
    transit001: 'in_transit', // unterwegs zum Ziel
    transit002: 'in_transit', // in Hub / Sortiercenter angekommen
    transit003: 'in_transit', // in Zustellzentrum angekommen
    transit004: 'in_transit', // im Zielland angekommen
    transit005: 'in_transit', // Zoll abgefertigt
    transit006: 'in_transit', // versandt
    transit007: 'in_transit', // Abflug vom Flughafen
    // Out for Delivery / Pickup
    pickup001: 'in_transit', // zur Zustellung unterwegs
    pickup002: 'in_packstation', // bereit zur Abholung an Packstation / Paketshop
    pickup003: 'in_transit', // Empfänger vor Zustellung kontaktiert
    // Delivered
    delivered001: 'delivered', // erfolgreich zugestellt
    delivered002: 'delivered', // vom Empfänger abgeholt
    delivered003: 'delivered', // quittiert / unterschrieben
    delivered004: 'delivered', // beim Nachbarn / vor der Tür hinterlassen
    // Failed Attempt
    undelivered001: 'in_transit', // Adressproblem
    undelivered002: 'in_transit', // Empfänger nicht angetroffen
    undelivered003: 'in_transit', // Empfänger nicht auffindbar
    undelivered004: 'in_transit', // anderer Grund
    // Exception
    exception004: 'in_transit', // nicht abgeholt
    exception005: 'in_transit', // sonstige Ausnahme
    exception006: 'in_transit', // Zollbeschlagnahmung
    exception007: 'in_transit', // beschädigt / verloren
    exception008: 'in_transit', // storniert
    exception009: 'in_transit', // vom Empfänger abgelehnt
    exception010: 'delivered', // an Absender zurückgesendet (abgeschlossen)
    exception011: 'in_transit', // wird an Absender zurückgesendet
    // Not Found / Expired
    notfound002: 'unknown',
    expired001: 'unknown',
};
let _sdk = null;
function getSdk() {
    if (!_sdk) {
        const key = process.env.TRACKINGMORE_API_KEY;
        if (!key)
            throw new types_1.TrackingProviderError('trackingmore', 'auth', 'TRACKINGMORE_API_KEY fehlt in .env');
        _sdk = new TrackingMoreSDK(key);
    }
    return _sdk;
}
// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
function mapCarrierKey(carrier) {
    const key = carrier.trim().toLowerCase();
    return CARRIER_CODE_MAP[key] ?? null;
}
/**
 * Mapped einen TrackingMore-Status (Haupt- oder Sub-Status) auf unseren internen Status.
 * Sub-Status-Codes (z. B. "transit001", "pickup002") werden bevorzugt behandelt.
 */
function mapStatus(raw) {
    if (!raw)
        return 'unknown';
    const key = raw.trim().toLowerCase();
    // Sub-Status zuerst prüfen (exakter Schlüssel)
    if (TM_SUBSTATUS_MAP[key])
        return TM_SUBSTATUS_MAP[key];
    // Hauptstatus (nur Buchstaben, keine Ziffern)
    const mainKey = key.replace(/[^a-z]/g, '');
    return TM_MAIN_STATUS_MAP[mainKey] ?? 'unknown';
}
/** HTTP-/SDK-Rückgabe: `data` als Array, Objekt mit trackings[], oder ein einzelnes Tracking-Objekt */
function extractTrackingsFromEnvelope(env) {
    if (!env || typeof env !== 'object')
        return [];
    const raw = env.data;
    if (raw === null || raw === undefined) {
        const mc = envelopeMetaCode(env);
        if (mc !== undefined && mc !== 200 && mc !== 4101)
            return [];
        return [];
    }
    let items = [];
    if (Array.isArray(raw)) {
        items = raw.map(normalizeTmTrackingItem).filter((x) => x !== null);
    }
    else if (typeof raw === 'object') {
        const d = raw;
        if (Array.isArray(d.trackings)) {
            items = d.trackings
                .map(normalizeTmTrackingItem)
                .filter((x) => x !== null);
        }
        else if (typeof d.tracking_number === 'string') {
            const one = normalizeTmTrackingItem(d);
            if (one)
                items = [one];
        }
    }
    if (items.length > 0)
        return items;
    const mc = envelopeMetaCode(env);
    if (mc !== undefined && mc !== 200 && mc !== 4101)
        return [];
    return [];
}
/**
 * Feldnamen v4 angleichen: manche Responses nutzen `status` statt `delivery_status`,
 * sowie Varianten bei Courier-Feldnamen.
 */
function normalizeTmTrackingItem(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const t = raw;
    const tracking_number = typeof t.tracking_number === 'string' ? t.tracking_number : '';
    if (!tracking_number)
        return null;
    const courier = (typeof t.courier_code === 'string' && t.courier_code)
        || (typeof t.carrier_code === 'string'
            && t.carrier_code)
        || 'unknown';
    const deliveryRaw = (typeof t.delivery_status === 'string' && t.delivery_status)
        || (typeof t.status === 'string' && t.status)
        || '';
    const merged = {
        ...t,
        tracking_number,
        courier_code: courier,
        delivery_status: deliveryRaw,
    };
    return merged;
}
function envelopeMetaCode(env) {
    if (!env || typeof env !== 'object')
        return undefined;
    const e = env;
    return e.meta?.code ?? e.code;
}
/** v4: Checkpoints oft unter origin_info.trackinfo / destination_info.trackinfo */
function collectCheckpoints(tracking) {
    const out = [];
    if (tracking.checkpoints?.length) {
        out.push(...tracking.checkpoints.filter((c) => Boolean(c.checkpoint_time)));
    }
    const mergeTrackinfo = (arr) => {
        for (const p of arr) {
            if (!p.checkpoint_date)
                continue;
            out.push({
                checkpoint_time: p.checkpoint_date,
                message: p.tracking_detail,
                checkpoint_status: p.checkpoint_delivery_status,
                substatus: p.checkpoint_delivery_substatus,
                location: p.location ?? undefined,
                city: p.city ?? undefined,
            });
        }
    };
    mergeTrackinfo(tracking.origin_info?.trackinfo ?? []);
    mergeTrackinfo(tracking.destination_info?.trackinfo ?? []);
    const seen = new Set();
    const deduped = out.filter((c) => {
        const k = `${c.checkpoint_time}::${c.message ?? ''}::${c.substatus ?? ''}`;
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
    deduped.sort((a, b) => new Date(b.checkpoint_time).getTime() - new Date(a.checkpoint_time).getTime());
    return deduped;
}
/**
 * GET /v4/trackings/get – das SDK hat einen Bug bei Query-Params (pathname strippt search),
 * daher nutzen wir hier einen direkten fetch-Aufruf.
 */
async function getTrackingData(trackingNumber, courierCode) {
    const apiKey = process.env.TRACKINGMORE_API_KEY;
    const url = `https://api.trackingmore.com/v4/trackings/get?tracking_numbers=${encodeURIComponent(trackingNumber)}&courier_code=${encodeURIComponent(courierCode)}`;
    const timeoutMs = Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: {
                'Tracking-Api-Key': apiKey,
                'Accept': 'application/json',
            },
            signal: controller.signal,
        });
    }
    catch (err) {
        clearTimeout(timer);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        throw new types_1.TrackingProviderError('trackingmore', isAbort ? 'timeout' : 'network', String(err));
    }
    clearTimeout(timer);
    const body = await response.text().catch(() => '');
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new types_1.TrackingProviderError('trackingmore', 'auth', `TrackingMore API Key ungültig (HTTP ${response.status})`);
        }
        if (response.status === 429) {
            throw new types_1.TrackingProviderError('trackingmore', 'rate_limit', 'TrackingMore Rate-Limit erreicht', true);
        }
        throw new types_1.TrackingProviderError('trackingmore', 'unknown', `TrackingMore GET Fehler ${response.status}: ${body.slice(0, 300)}`);
    }
    try {
        return JSON.parse(body);
    }
    catch {
        throw new types_1.TrackingProviderError('trackingmore', 'unknown', `TrackingMore Antwort kein JSON: ${body.slice(0, 200)}`);
    }
}
// ─── Provider ─────────────────────────────────────────────────────────────────
class TrackingMoreProvider {
    providerName = 'trackingmore';
    carrierKeys = Object.keys(CARRIER_CODE_MAP);
    isConfigured() {
        return Boolean(process.env.TRACKINGMORE_API_KEY);
    }
    async fetchTracking(trackingNumber, carrier) {
        if (!this.isConfigured()) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'TRACKINGMORE_API_KEY fehlt in .env');
        }
        const sdk = getSdk();
        // ── 1. Carrier-Code ermitteln ─────────────────────────────────────────────
        let courierCode = carrier ? mapCarrierKey(carrier) : null;
        if (!courierCode) {
            // Unbekannter Carrier → automatische Erkennung über API
            console.log(`[TrackingMore] Carrier "${carrier ?? '–'}" unbekannt → automatische Erkennung für ${trackingNumber}`);
            try {
                const detected = await sdk.couriers.detect({ tracking_number: trackingNumber });
                const dCode = envelopeMetaCode(detected) ?? detected.code;
                const detectOk = dCode === undefined || dCode === 200;
                if (detectOk && detected.data && detected.data.length > 0) {
                    courierCode = detected.data[0].courier_code;
                    console.log(`[TrackingMore] Erkannt: ${courierCode} (${detected.data[0].courier_name})`);
                }
            }
            catch (err) {
                console.warn('[TrackingMore] Carrier-Erkennung fehlgeschlagen:', err);
            }
        }
        if (!courierCode) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Carrier für Sendungsnummer ${trackingNumber} konnte nicht ermittelt werden`);
        }
        // ── 2. Tracking registrieren (createTracking); Payload enthält oft bereits alle Daten ───
        let createEnvelope = null;
        try {
            createEnvelope = await sdk.trackings.createTracking({
                tracking_number: trackingNumber,
                courier_code: courierCode,
            });
            const cc = envelopeMetaCode(createEnvelope);
            // v4: Erfolg meist unter meta.code; Root-code oft nicht gesetzt
            if (cc !== undefined && cc !== 200 && cc !== 4101) {
                console.warn(`[TrackingMore] createTracking meta.code ${String(cc)}`);
            }
        }
        catch (err) {
            console.warn('[TrackingMore] createTracking Fehler (ignoriert):', err);
        }
        // ── 3. Tracking-Status abrufen (GET); Fallback: Daten aus createTracking ─────────────
        let trackingItems = [];
        try {
            const result = await getTrackingData(trackingNumber, courierCode);
            trackingItems = extractTrackingsFromEnvelope(result);
        }
        catch (err) {
            console.warn('[TrackingMore] GET trackings/get:', err);
        }
        if (trackingItems.length === 0 && createEnvelope) {
            trackingItems = extractTrackingsFromEnvelope(createEnvelope);
        }
        if (trackingItems.length === 0) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Keine Daten für Sendung ${trackingNumber} (${courierCode})`);
        }
        const tracking = trackingItems[0];
        const deliveryStatusRaw = tracking.delivery_status
            || tracking.status
            || '';
        // ── Status: delivery_status „delivered“ → Geliefert (DB: delivered → Frontend „Zugestellt“)
        let internalStatus = mapStatus(tracking.substatus ?? deliveryStatusRaw);
        const latestEvent = tracking.latest_event ?? '';
        if ((0, normalization_1.detectPackstationFromDescription)(latestEvent))
            internalStatus = 'in_packstation';
        const checkpointRows = collectCheckpoints(tracking);
        let rawEvents = checkpointRows.flatMap((cp) => {
            if (!cp.checkpoint_time)
                return [];
            const ts = new Date(cp.checkpoint_time);
            if (isNaN(ts.getTime()))
                return [];
            const desc = cp.message || 'Status-Update';
            let evInternal = mapStatus(cp.substatus ?? cp.checkpoint_status);
            if ((0, normalization_1.detectPackstationFromDescription)(desc))
                evInternal = 'in_packstation';
            const location = [cp.city, cp.country_name].filter(Boolean).join(', ')
                || cp.location || '';
            return [{
                    timestamp: ts,
                    location,
                    status: (0, normalization_1.internalStatusToDb)(evInternal),
                    description: desc,
                }];
        });
        if (rawEvents.length === 0) {
            const t = tracking.latest_checkpoint_time && !isNaN(new Date(tracking.latest_checkpoint_time).getTime())
                ? new Date(tracking.latest_checkpoint_time)
                : new Date();
            rawEvents.push({
                timestamp: t,
                location: '',
                status: (0, normalization_1.internalStatusToDb)(internalStatus),
                description: latestEvent || deliveryStatusRaw || 'Status-Update',
            });
        }
        const events = (0, normalization_1.dedupeEvents)(rawEvents).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        // ── Estimated Delivery ────────────────────────────────────────────────────
        let estimatedDelivery;
        const etaRaw = tracking.estimated_delivery_date ?? tracking.scheduled_delivery_date;
        if (etaRaw) {
            const d = new Date(etaRaw);
            if (!isNaN(d.getTime()))
                estimatedDelivery = d;
        }
        return {
            provider: `${this.providerName}/${courierCode}`,
            internalStatus,
            status: (0, normalization_1.internalStatusToDb)(internalStatus),
            events,
            estimatedDelivery,
        };
    }
}
exports.TrackingMoreProvider = TrackingMoreProvider;
//# sourceMappingURL=trackingmore.js.map