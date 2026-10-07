"use strict";
/**
 * AfterShip – universeller Tracking-Provider via offizielles Node.js SDK
 *
 * SDK:  https://github.com/AfterShip/tracking-sdk-nodejs
 * API:  https://api.aftership.com/tracking/2025-07
 * Auth: Header "as-api-key: <key>"
 *
 * Ablauf:
 *  1. Carrier-Slug ermitteln (couriers/detect)
 *  2. createTracking – registriert die Sendungsnummer (4003 = bereits bekannt, wird ignoriert)
 *  3. getTrackings – aktueller Status + Checkpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AfterShipProvider = void 0;
exports.deleteTrackingFromAfterShip = deleteTrackingFromAfterShip;
const tracking_sdk_1 = require("@aftership/tracking-sdk");
const normalization_1 = require("../normalization");
const types_1 = require("../types");
// ─── Carrier-Slug-Mapping ─────────────────────────────────────────────────────
// Interne Carrier-Bezeichnungen → AfterShip slug
const CARRIER_SLUG_MAP = {
    'dhl': 'dhl',
    'dhl-germany': 'dhl-germany',
    'dhl germany': 'dhl-germany',
    'dhl paket': 'dhl-germany',
    'dhl express': 'dhl',
    'deutsche-post': 'deutsche-post',
    'deutsche post': 'deutsche-post',
    'deutschepost': 'deutsche-post',
    'ups': 'ups',
    'hermes': 'hermes-de',
    'hermes-germany': 'hermes-de',
    'hermes-de': 'hermes-de',
    'hermesworld': 'hermes',
    'myhermes': 'hermes-de',
    'dpd': 'dpd-de',
    'dpd-germany': 'dpd-de',
    'dpd-de': 'dpd-de',
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
// ─── Status-Mapping ─────────────────────────────────────────────────────────────
// Quelle: https://www.aftership.com/docs/tracking/enum/delivery-statuses
const AS_TAG_MAP = {
    pending: 'unknown',
    inforeceived: 'info_received',
    intransit: 'in_transit',
    outfordelivery: 'out_for_delivery',
    attemptfail: 'in_transit',
    delivered: 'delivered',
    availableforpickup: 'in_packstation',
    exception: 'in_transit',
    expired: 'unknown',
};
const AS_SUBTAG_MAP = {
    inforeceived001: 'info_received',
    intransit001: 'in_transit',
    intransit002: 'in_transit',
    intransit003: 'in_transit',
    intransit004: 'in_transit',
    intransit005: 'in_transit',
    intransit006: 'in_transit',
    intransit007: 'in_transit',
    outfordelivery001: 'out_for_delivery',
    availableforpickup001: 'in_packstation',
    delivered001: 'delivered',
    delivered002: 'delivered',
    delivered003: 'delivered',
    delivered004: 'delivered',
    attemptfail001: 'in_transit',
    attemptfail002: 'in_transit',
    attemptfail003: 'in_transit',
    exception004: 'in_transit',
    exception005: 'in_transit',
    exception006: 'in_transit',
    exception007: 'in_transit',
    exception008: 'in_transit',
    exception009: 'in_transit',
    exception010: 'delivered',
    exception011: 'in_transit',
    pending001: 'unknown',
    expired001: 'unknown',
};
let _sdk = null;
const AS_LOG_PREFIX = '[AfterShip API]';
const AS_LOG_BODY_MAX = 12_000;
function asLogEnabled() {
    const flag = process.env.AFTERSHIP_DEBUG_LOG?.trim().toLowerCase();
    if (flag === 'true' || flag === '1' || flag === 'yes')
        return true;
    if (flag === 'false' || flag === '0' || flag === 'no')
        return false;
    return process.env.NODE_ENV !== 'production';
}
function asSafeJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
function asTruncate(text, max = AS_LOG_BODY_MAX) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max)}\n… (${text.length - max} weitere Zeichen gekürzt)`;
}
function asLogRequest(method, endpoint, payload) {
    if (!asLogEnabled())
        return;
    console.log(`${AS_LOG_PREFIX} → ${method} ${endpoint}`);
    if (payload !== undefined) {
        console.log(`${AS_LOG_PREFIX}   Anfrage:\n${asTruncate(asSafeJson(payload))}`);
    }
}
function asLogResponse(endpoint, status, body, extra) {
    if (!asLogEnabled())
        return;
    const suffix = extra ? ` (${extra})` : '';
    console.log(`${AS_LOG_PREFIX} ← ${endpoint} [${status}]${suffix}`);
    console.log(`${AS_LOG_PREFIX}   Antwort:\n${asTruncate(asSafeJson(body))}`);
}
function getSdk() {
    if (!_sdk) {
        const key = process.env.AFTERSHIP_API_KEY?.trim();
        if (!key) {
            throw new types_1.TrackingProviderError('aftership', 'auth', 'AFTERSHIP_API_KEY fehlt in .env');
        }
        _sdk = new tracking_sdk_1.AfterShip({
            api_key: key,
            timeout: Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000),
        });
    }
    return _sdk;
}
function normalizeStatusKey(raw) {
    return (raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}
function mapStatus(raw) {
    if (!raw)
        return 'unknown';
    const key = normalizeStatusKey(raw);
    if (AS_SUBTAG_MAP[key])
        return AS_SUBTAG_MAP[key];
    return AS_TAG_MAP[key] ?? 'unknown';
}
function asUserMessage(err) {
    switch (err.code) {
        case tracking_sdk_1.AfterShipErrorCodes.TOO_MANY_REQUEST:
        case tracking_sdk_1.AfterShipErrorCodes.RATE_LIMIT_EXCEED:
            return 'AfterShip Rate-Limit erreicht – bitte kurz warten und erneut versuchen.';
        case tracking_sdk_1.AfterShipErrorCodes.API_KEY_INVALID:
        case tracking_sdk_1.AfterShipErrorCodes.INVALID_API_KEY:
        case tracking_sdk_1.AfterShipErrorCodes.REQUEST_NOT_ALLOWED:
            return 'AfterShip API-Key ungültig – Zugangsdaten unter https://organization.automizely.com/api-keys prüfen.';
        case tracking_sdk_1.AfterShipErrorCodes.TRACKING_DOES_NOT_EXIST:
        case tracking_sdk_1.AfterShipErrorCodes.NOT_FOUND:
            return 'Sendung bei AfterShip nicht gefunden.';
        case tracking_sdk_1.AfterShipErrorCodes.BAD_COURIER:
            return 'AfterShip konnte keinen Carrier für diese Sendungsnummer erkennen.';
        default:
            return err.message || `AfterShip-Fehler (Code ${err.meta_code ?? 'unbekannt'})`;
    }
}
function isQuotaError(err) {
    return err.code === tracking_sdk_1.AfterShipErrorCodes.TOO_MANY_REQUEST
        || err.code === tracking_sdk_1.AfterShipErrorCodes.RATE_LIMIT_EXCEED;
}
function isAuthError(err) {
    return err.code === tracking_sdk_1.AfterShipErrorCodes.API_KEY_INVALID
        || err.code === tracking_sdk_1.AfterShipErrorCodes.INVALID_API_KEY
        || err.code === tracking_sdk_1.AfterShipErrorCodes.REQUEST_NOT_ALLOWED;
}
function isNotFoundError(err) {
    return err.code === tracking_sdk_1.AfterShipErrorCodes.TRACKING_DOES_NOT_EXIST
        || err.code === tracking_sdk_1.AfterShipErrorCodes.NOT_FOUND;
}
function isAlreadyExistsError(err) {
    if (!(err instanceof tracking_sdk_1.AftershipError)) {
        return false;
    }
    return err.code === tracking_sdk_1.AfterShipErrorCodes.TRACKING_ALREADY_EXIST;
}
async function detectCourierSlug(sdk, trackingNumber) {
    const payload = { tracking_number: trackingNumber };
    try {
        asLogRequest('POST', '/couriers/detect', payload);
        const detected = await sdk.courier.detectCourier(payload);
        asLogResponse('/couriers/detect', 'ok', detected);
        const couriers = detected.data?.couriers ?? [];
        if (couriers.length > 0 && couriers[0].slug) {
            const { slug, name } = couriers[0];
            console.log(`[AfterShip] Erkannt: ${slug} (${name ?? slug})`);
            return { slug, name: name ?? slug };
        }
    }
    catch (err) {
        console.warn('[AfterShip] Carrier-Erkennung fehlgeschlagen:', err);
        if (asLogEnabled()) {
            console.warn(`${AS_LOG_PREFIX}   Fehler couriers/detect:`, err);
        }
    }
    return null;
}
async function getTrackingData(sdk, trackingNumber, slug) {
    const query = { tracking_numbers: trackingNumber, slug };
    asLogRequest('GET', '/trackings', query);
    const result = await sdk.tracking.getTrackings(query);
    asLogResponse('/trackings', 'ok', result);
    return result.data?.trackings?.[0] ?? null;
}
function buildTrackingResult(tracking, trackingNumber, slug, detected) {
    const tagRaw = tracking.tag ?? '';
    let internalStatus = mapStatus(tracking.subtag ?? tagRaw);
    const latestMessage = tracking.subtag_message ?? '';
    if ((0, normalization_1.detectPackstationFromDescription)(latestMessage))
        internalStatus = 'in_packstation';
    const checkpointRows = [...(tracking.checkpoints ?? [])].sort((a, b) => new Date(b.checkpoint_time ?? 0).getTime() - new Date(a.checkpoint_time ?? 0).getTime());
    let rawEvents = checkpointRows.flatMap((cp) => {
        if (!cp.checkpoint_time)
            return [];
        const ts = new Date(cp.checkpoint_time);
        if (isNaN(ts.getTime()))
            return [];
        const desc = cp.message || cp.subtag_message || 'Status-Update';
        let evInternal = mapStatus(cp.subtag ?? cp.tag);
        if ((0, normalization_1.detectPackstationFromDescription)(desc))
            evInternal = 'in_packstation';
        const location = [cp.city, cp.country_region_name].filter(Boolean).join(', ')
            || cp.location || '';
        return [{
                timestamp: ts,
                location,
                status: (0, normalization_1.internalStatusToDb)(evInternal),
                description: desc,
            }];
    });
    if (rawEvents.length === 0) {
        rawEvents.push({
            timestamp: new Date(),
            location: '',
            status: (0, normalization_1.internalStatusToDb)(internalStatus),
            description: latestMessage || tagRaw || 'Status-Update',
        });
    }
    const events = (0, normalization_1.dedupeEvents)(rawEvents).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    let estimatedDelivery;
    const etaRaw = tracking.courier_estimated_delivery_date?.estimated_delivery_date
        ?? tracking.courier_estimated_delivery_date?.estimated_delivery_date_max
        ?? tracking.latest_estimated_delivery?.datetime;
    if (etaRaw) {
        const d = new Date(etaRaw);
        if (!isNaN(d.getTime()))
            estimatedDelivery = d;
    }
    return {
        provider: `aftership/${slug}`,
        internalStatus,
        status: (0, normalization_1.internalStatusToDb)(internalStatus),
        events,
        estimatedDelivery,
        detectedCarrier: detected?.name,
        courierCode: slug,
    };
}
// ─── Provider ─────────────────────────────────────────────────────────────────
class AfterShipProvider {
    providerName = 'aftership';
    carrierKeys = Object.keys(CARRIER_SLUG_MAP);
    isConfigured() {
        return Boolean(process.env.AFTERSHIP_API_KEY?.trim());
    }
    async fetchTracking(trackingNumber) {
        if (!this.isConfigured()) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'AFTERSHIP_API_KEY fehlt in .env');
        }
        const sdk = getSdk();
        if (asLogEnabled()) {
            console.log(`${AS_LOG_PREFIX} ══ Tracking-Abfrage: ${trackingNumber} ══`);
        }
        const detected = await detectCourierSlug(sdk, trackingNumber);
        const slug = detected?.slug ?? null;
        if (!slug) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Carrier für Sendungsnummer ${trackingNumber} konnte nicht ermittelt werden`);
        }
        let createResult = null;
        let lastError = null;
        const createPayload = { tracking_number: trackingNumber, slug };
        try {
            asLogRequest('POST', '/trackings', createPayload);
            const created = await sdk.tracking.createTracking(createPayload);
            asLogResponse('/trackings', 'ok', created);
            createResult = created.data ?? null;
        }
        catch (err) {
            if (!isAlreadyExistsError(err)) {
                if (err instanceof tracking_sdk_1.AftershipError) {
                    if (isQuotaError(err))
                        lastError = new types_1.TrackingProviderError('aftership', 'rate_limit', asUserMessage(err), true);
                    else if (isAuthError(err))
                        lastError = new types_1.TrackingProviderError('aftership', 'auth', asUserMessage(err));
                }
                console.warn('[AfterShip] createTracking Fehler (ignoriert):', err);
                if (asLogEnabled()) {
                    console.warn(`${AS_LOG_PREFIX}   Fehler trackings/create:`, err);
                }
            }
        }
        let trackingItem = null;
        try {
            trackingItem = await getTrackingData(sdk, trackingNumber, slug);
        }
        catch (err) {
            if (err instanceof tracking_sdk_1.AftershipError) {
                if (isQuotaError(err))
                    lastError = new types_1.TrackingProviderError('aftership', 'rate_limit', asUserMessage(err), true);
                else if (isAuthError(err))
                    lastError = new types_1.TrackingProviderError('aftership', 'auth', asUserMessage(err));
            }
            console.warn('[AfterShip] getTrackings:', err);
        }
        if (!trackingItem && createResult) {
            trackingItem = createResult;
        }
        if (!trackingItem) {
            if (lastError)
                throw lastError;
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Keine Tracking-Daten für Sendung ${trackingNumber} (${slug}).`);
        }
        return buildTrackingResult(trackingItem, trackingNumber, slug, detected);
    }
}
exports.AfterShipProvider = AfterShipProvider;
// ─── Tracking bei AfterShip entfernen (Bestellung bleibt lokal) ─────────────────
function resolveSlugFromCarrier(carrier) {
    if (!carrier?.trim())
        return null;
    const key = carrier.trim().toLowerCase();
    return CARRIER_SLUG_MAP[key] ?? null;
}
/**
 * Entfernt eine Sendung aus dem AfterShip-Konto (DELETE by ID).
 * Lokale Bestellungen und Tracking-Events werden nicht gelöscht.
 * Fehler werden geloggt, werfen aber keine Exception (idempotent).
 */
async function deleteTrackingFromAfterShip(trackingNumber, options = {}) {
    if (!process.env.AFTERSHIP_API_KEY?.trim())
        return;
    const tn = trackingNumber?.trim();
    if (!tn)
        return;
    let slug = options.courierCode?.trim()
        || resolveSlugFromCarrier(options.carrier)
        || null;
    const sdk = getSdk();
    if (!slug) {
        const detected = await detectCourierSlug(sdk, tn);
        slug = detected?.slug ?? null;
    }
    if (!slug) {
        console.warn(`[AfterShip] Löschen übersprungen – kein Carrier für ${tn}`);
        return;
    }
    let asId = null;
    try {
        const item = await getTrackingData(sdk, tn, slug);
        asId = item?.id ?? null;
    }
    catch (err) {
        console.warn('[AfterShip] GET vor Löschen fehlgeschlagen:', err.message);
    }
    if (!asId) {
        console.log(`[AfterShip] Nichts zu löschen (keine AfterShip-ID) für ${tn}`);
        return;
    }
    try {
        asLogRequest('DELETE', `/trackings/${asId}`);
        const result = await sdk.tracking.deleteTrackingById(asId);
        asLogResponse(`/trackings/${asId}`, 'ok', result);
        console.log(`[AfterShip] Sendung ${tn} aus AfterShip entfernt`);
    }
    catch (err) {
        if (err instanceof tracking_sdk_1.AftershipError && isNotFoundError(err)) {
            console.log(`[AfterShip] Sendung ${tn} war bereits entfernt`);
            return;
        }
        console.warn('[AfterShip] deleteTrackingById fehlgeschlagen:', err.message);
    }
}
//# sourceMappingURL=aftership.js.map