"use strict";
/**
 * KeyDelivery – universeller Tracking-Provider
 *
 * API:  https://www.kd100.com/docs/getting-started
 * Auth: Header API-Key + signature (MD5(JSON+API-Key+Secret), 32 Zeichen, Großbuchstaben)
 *
 * Ablauf:
 *  1. Carrier-Code ermitteln (carriers/detect oder internes Mapping)
 *  2. POST /api/v1/tracking/realtime – aktueller Status + Events
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyDeliveryProvider = void 0;
exports.deleteTrackingFromKeyDelivery = deleteTrackingFromKeyDelivery;
const crypto_1 = require("crypto");
const normalization_1 = require("../normalization");
const types_1 = require("../types");
const KD_BASE_URL = 'https://www.kd100.com/api/v1';
// Interne Carrier-Bezeichnungen → KeyDelivery carrier_id
const CARRIER_CODE_MAP = {
    dhl: 'dhl',
    'dhl-germany': 'dhl',
    'dhl germany': 'dhl',
    'dhl paket': 'dhl',
    'dhl express': 'dhl',
    'deutsche-post': 'deutschepost',
    'deutsche post': 'deutschepost',
    deutschepost: 'deutschepost',
    ups: 'ups',
    hermes: 'hermes',
    'hermes-germany': 'hermes',
    hermesworld: 'hermes',
    myhermes: 'hermes',
    dpd: 'dpd',
    'dpd-germany': 'dpd',
    gls: 'gls',
    'gls-germany': 'gls',
    fedex: 'fedex',
    amazon: 'amazon',
    'amazon-logistics': 'amazon',
    'amazon logistics': 'amazon',
    postnl: 'postnl',
    'post-nl': 'postnl',
    evri: 'evri',
    tnt: 'tnt',
};
// Quelle: https://www.kd100.com/docs/tracking-status-codes
function mapOrderStatusCode(code, description) {
    const num = typeof code === 'string' ? parseInt(code, 10) : code;
    if (num !== undefined && !Number.isNaN(num)) {
        if ([3, 301, 302, 303, 304, 4, 401].includes(num))
            return 'delivered';
        if (num === 501)
            return 'in_packstation';
        if ([5].includes(num))
            return 'in_transit';
        if ([1, 101, 102, 103].includes(num))
            return 'info_received';
        if ([0, 1001, 1002, 1003, 2, 201, 202, 203, 204, 205, 206, 207, 208, 209, 6, 7, 8, 10, 11, 12, 13, 14].includes(num)) {
            return 'in_transit';
        }
    }
    if (description) {
        const d = description.toLowerCase();
        if (d.includes('delivered') || d.includes('zugestellt'))
            return 'delivered';
        if (d.includes('pickup') || d.includes('collection') || d.includes('abhol'))
            return 'in_packstation';
        if (d.includes('accepted') || d.includes('info received'))
            return 'info_received';
        if (d.includes('out for delivery') || d.includes('transit') || d.includes('exception'))
            return 'in_transit';
    }
    return 'unknown';
}
const KD_LOG_PREFIX = '[KeyDelivery API]';
const KD_LOG_BODY_MAX = 12_000;
function kdLogEnabled() {
    const flag = process.env.KEYDELIVERY_DEBUG_LOG?.trim().toLowerCase();
    if (flag === 'true' || flag === '1' || flag === 'yes')
        return true;
    if (flag === 'false' || flag === '0' || flag === 'no')
        return false;
    return process.env.NODE_ENV !== 'production';
}
function kdSafeJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
function kdTruncate(text, max = KD_LOG_BODY_MAX) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max)}\n… (${text.length - max} weitere Zeichen gekürzt)`;
}
function kdLogRequest(method, endpoint, payload) {
    if (!kdLogEnabled())
        return;
    console.log(`${KD_LOG_PREFIX} → ${method} ${endpoint}`);
    if (payload !== undefined) {
        console.log(`${KD_LOG_PREFIX}   Anfrage:\n${kdTruncate(kdSafeJson(payload))}`);
    }
}
function kdLogResponse(endpoint, status, body, extra) {
    if (!kdLogEnabled())
        return;
    const suffix = extra ? ` (${extra})` : '';
    console.log(`${KD_LOG_PREFIX} ← ${endpoint} [${status}]${suffix}`);
    console.log(`${KD_LOG_PREFIX}   Antwort:\n${kdTruncate(kdSafeJson(body))}`);
}
function getCredentials() {
    const apiKey = process.env.KEYDELIVERY_API_KEY?.trim();
    const secret = process.env.KEYDELIVERY_API_SECRET?.trim();
    if (!apiKey || !secret) {
        throw new types_1.TrackingProviderError('keydelivery', 'auth', 'KEYDELIVERY_API_KEY und KEYDELIVERY_API_SECRET fehlen in .env');
    }
    return { apiKey, secret };
}
function buildSignature(json, apiKey, secret) {
    return (0, crypto_1.createHash)('md5').update(json + apiKey + secret).digest('hex').toUpperCase();
}
function kdUserMessage(code, fallback) {
    switch (code) {
        case 401:
            return 'KeyDelivery-Kontingent aufgebraucht – bitte Guthaben im KeyDelivery-Konto aufladen.';
        case 404:
            return 'KeyDelivery API-Key ungültig – Zugangsdaten unter https://app.kd100.com/api-management prüfen.';
        case 104:
            return 'KeyDelivery-Signatur ungültig – API-Key und Secret prüfen.';
        case 405:
            return 'KeyDelivery: ungültige carrier_id für diese Sendungsnummer.';
        case 406:
            return 'KeyDelivery konnte keinen Carrier für diese Sendungsnummer erkennen.';
        case 60101:
            return 'Keine Tracking-Daten gefunden – bitte später erneut versuchen.';
        default:
            return fallback ?? `KeyDelivery-Fehler (Code ${code ?? 'unbekannt'})`;
    }
}
function throwIfKdError(envelope, context) {
    const code = envelope.code;
    if (code === undefined || code === 200 || code === 60201)
        return;
    const msg = kdUserMessage(code, envelope.message ?? `KeyDelivery ${context} (Code ${code})`);
    if (code === 401) {
        throw new types_1.TrackingProviderError('keydelivery', 'rate_limit', msg, true);
    }
    if (code === 404 || code === 102 || code === 104) {
        throw new types_1.TrackingProviderError('keydelivery', 'auth', msg);
    }
    if (code === 60101 || code === 406) {
        throw new types_1.TrackingProviderError('keydelivery', 'not_found', msg);
    }
    if (code === 405) {
        throw new types_1.TrackingProviderError('keydelivery', 'not_found', msg);
    }
}
async function kdPost(path, body) {
    const { apiKey, secret } = getCredentials();
    const json = JSON.stringify(body);
    const signature = buildSignature(json, apiKey, secret);
    const url = `${KD_BASE_URL}${path}`;
    const timeoutMs = Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    kdLogRequest('POST', url, body);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': apiKey,
                signature,
            },
            body: json,
            signal: controller.signal,
        });
        clearTimeout(timer);
        const text = await response.text().catch(() => '');
        let parsed = {};
        try {
            parsed = text ? JSON.parse(text) : {};
        }
        catch {
            parsed = { message: text };
        }
        kdLogResponse(path, response.status, parsed);
        if (response.status === 429) {
            throw new types_1.TrackingProviderError('keydelivery', 'rate_limit', 'KeyDelivery Rate-Limit erreicht', true);
        }
        return parsed;
    }
    catch (err) {
        clearTimeout(timer);
        if (err instanceof types_1.TrackingProviderError)
            throw err;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        throw new types_1.TrackingProviderError('keydelivery', isAbort ? 'timeout' : 'network', String(err));
    }
}
async function detectCarrierCodes(trackingNumber) {
    try {
        const result = await kdPost('/carriers/detect', { tracking_number: trackingNumber });
        throwIfKdError(result, 'carriers/detect');
        if (result.data?.length) {
            console.log(`[KeyDelivery] Erkannt: ${result.data[0].carrier_id} (${result.data[0].carrier_name})`);
            return result.data;
        }
    }
    catch (err) {
        if (err instanceof types_1.TrackingProviderError && (err.type === 'auth' || err.type === 'rate_limit'))
            throw err;
        console.warn('[KeyDelivery] Carrier-Erkennung fehlgeschlagen:', err);
    }
    return [];
}
function resolveCarrierCodeFromCarrier(carrier) {
    if (!carrier?.trim())
        return null;
    const key = carrier.trim().toLowerCase();
    return CARRIER_CODE_MAP[key] ?? null;
}
function buildTrackingResult(data, trackingNumber, detected) {
    const carrierId = data.carrier_id;
    let internalStatus = mapOrderStatusCode(data.order_status_code);
    const items = data.items ?? [];
    if (items.length > 0) {
        const latest = items[0];
        internalStatus = mapOrderStatusCode(latest.order_status_code ?? data.order_status_code, latest.order_status_description);
        if ((0, normalization_1.detectPackstationFromDescription)(latest.context))
            internalStatus = 'in_packstation';
    }
    let rawEvents = items.flatMap((item) => {
        const ts = new Date(item.time);
        if (Number.isNaN(ts.getTime()))
            return [];
        const desc = item.context || item.order_status_description || 'Status-Update';
        let evStatus = mapOrderStatusCode(item.order_status_code, item.order_status_description);
        if ((0, normalization_1.detectPackstationFromDescription)(desc))
            evStatus = 'in_packstation';
        const location = [item.location, item.area_name].filter((v) => v && v !== 'null').join(', ')
            || '';
        return [{
                timestamp: ts,
                location,
                status: (0, normalization_1.internalStatusToDb)(evStatus),
                description: desc,
            }];
    });
    if (rawEvents.length === 0) {
        rawEvents.push({
            timestamp: new Date(),
            location: '',
            status: (0, normalization_1.internalStatusToDb)(internalStatus),
            description: `Status-Code ${data.order_status_code}`,
        });
    }
    const events = (0, normalization_1.dedupeEvents)(rawEvents).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return {
        provider: `keydelivery/${carrierId}`,
        internalStatus,
        status: (0, normalization_1.internalStatusToDb)(internalStatus),
        events,
        detectedCarrier: detected?.carrier_name,
        courierCode: carrierId,
    };
}
async function fetchRealtimeTracking(trackingNumber, carrierId) {
    const result = await kdPost('/tracking/realtime', {
        carrier_id: carrierId,
        tracking_number: trackingNumber,
        area_show: 1,
        order: 'desc',
    });
    if (result.code === 60101 || result.code === 405)
        return null;
    throwIfKdError(result, 'tracking/realtime');
    return result.data ?? null;
}
class KeyDeliveryProvider {
    providerName = 'keydelivery';
    carrierKeys = Object.keys(CARRIER_CODE_MAP);
    isConfigured() {
        return Boolean(process.env.KEYDELIVERY_API_KEY?.trim() && process.env.KEYDELIVERY_API_SECRET?.trim());
    }
    async fetchTracking(trackingNumber, carrier) {
        if (!this.isConfigured()) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'KEYDELIVERY_API_KEY und KEYDELIVERY_API_SECRET fehlen in .env');
        }
        if (kdLogEnabled()) {
            console.log(`${KD_LOG_PREFIX} ══ Tracking-Abfrage: ${trackingNumber} ══`);
        }
        const detectedList = await detectCarrierCodes(trackingNumber);
        const carrierCandidates = [
            ...detectedList.map((d) => d.carrier_id),
            ...(carrier ? [resolveCarrierCodeFromCarrier(carrier)].filter(Boolean) : []),
        ].filter((id, idx, arr) => arr.indexOf(id) === idx);
        if (carrierCandidates.length === 0) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Carrier für Sendungsnummer ${trackingNumber} konnte nicht ermittelt werden`);
        }
        let lastError = null;
        for (const carrierId of carrierCandidates) {
            try {
                const data = await fetchRealtimeTracking(trackingNumber, carrierId);
                if (!data)
                    continue;
                const detected = detectedList.find((d) => d.carrier_id === carrierId) ?? detectedList[0] ?? null;
                return buildTrackingResult(data, trackingNumber, detected);
            }
            catch (err) {
                if (err instanceof types_1.TrackingProviderError) {
                    lastError = err;
                    if (err.type === 'auth' || err.type === 'rate_limit')
                        throw err;
                }
            }
        }
        if (lastError)
            throw lastError;
        throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Keine Tracking-Daten für Sendung ${trackingNumber}`);
    }
}
exports.KeyDeliveryProvider = KeyDeliveryProvider;
/**
 * KeyDelivery bietet keine Delete-Tracking-API; Sendungen enden automatisch nach Zustellung.
 * Diese Funktion bleibt als No-Op für bestehende Aufrufstellen erhalten.
 */
async function deleteTrackingFromKeyDelivery(trackingNumber, _options = {}) {
    if (!process.env.KEYDELIVERY_API_KEY?.trim())
        return;
    const tn = trackingNumber?.trim();
    if (!tn)
        return;
    if (kdLogEnabled()) {
        console.log(`[KeyDelivery] Löschen nicht unterstützt – Tracking für ${tn} läuft bei KeyDelivery automatisch aus`);
    }
}
//# sourceMappingURL=keydelivery.js.map