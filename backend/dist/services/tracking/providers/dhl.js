"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DhlTrackingProvider = void 0;
const normalization_1 = require("../normalization");
const types_1 = require("../types");
/**
 * DHL / Deutsche Post Tracking-Provider – unterstützt drei Authentifizierungsmodi:
 *
 * Modus A – DHL Unified Tracking API (einfacher API Key):
 *   Endpoint: https://api-eu.dhl.com/track/shipments
 *   Auth:     DHL-API-Key: <key>
 *   Env:      DHL_API_KEY  (allein, ohne DHL_API_SECRET)
 *
 * Modus B – Deutsche Post International / DHL Post & Parcel (OAuth 2.0):
 *   Token:    POST https://api.dhl.com/v1/auth/accesstoken  (Basic Auth: Key:Secret)
 *   Endpoint: https://api-eu.dhl.com/track/shipments
 *   Auth:     Authorization: Bearer <token>
 *   Env:      DHL_API_KEY (Consumer Key) + DHL_API_SECRET (Consumer Secret)
 *
 * Modus C – DHL Express (MyDHL API, Business-Kunden):
 *   Endpoint: https://express.api.dhl.com/mydhlapi/shipments/{nr}/tracking
 *   Auth:     Basic Auth
 *   Env:      DHL_API_USERNAME + DHL_API_PASSWORD
 *
 * Priorität: C > B > A
 */
// ─── Status-Maps ──────────────────────────────────────────────────────────────
const DHL_UNIFIED_STATUS_MAP = {
    pre_transit: 'info_received',
    transit: 'in_transit',
    delivered: 'delivered',
    failure: 'in_transit',
    unknown: 'unknown',
};
// TypeCodes für DHL Express (MyDHL API)
const DHL_EXPRESS_TYPECODE_MAP = {
    OK: 'delivered', DD: 'delivered', AD: 'delivered', PD: 'delivered',
    PU: 'in_transit', AF: 'in_transit', PL: 'in_transit', DF: 'in_transit',
    TR: 'in_transit', AR: 'in_transit', CR: 'in_transit', WC: 'in_transit',
    IC: 'in_transit', FD: 'in_transit', LV: 'in_transit', HN: 'in_transit',
    ND: 'in_transit', NH: 'in_transit', RD: 'in_transit', BA: 'in_transit',
    MD: 'in_transit', MS: 'in_transit', OH: 'in_transit', HP: 'in_transit',
    IR: 'in_transit',
    CC: 'in_packstation',
};
// ─── Token-Cache für OAuth2 ───────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;
async function getOAuthToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
        return cachedToken;
    }
    const credentials = Buffer.from(`${process.env.DHL_API_KEY}:${process.env.DHL_API_SECRET}`).toString('base64');
    const tokenUrl = process.env.DHL_TOKEN_URL || 'https://api.dhl.com/dpi/v1/auth/accesstoken';
    const timeoutMs = Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const myHeaders = new Headers();
    myHeaders.append("accept", "application/json");
    myHeaders.append("content-type", "application/json");
    myHeaders.append("Authorization", `Basic ${credentials}`);
    myHeaders.append("Accept", "*/*");
    const requestOptions = {
        method: "GET",
        headers: myHeaders,
        redirect: "follow",
        signal: controller.signal
    };
    let res;
    try {
        res = await fetch(tokenUrl, requestOptions);
    }
    catch (err) {
        clearTimeout(timeout);
        throw new types_1.TrackingProviderError('dhl', 'network', `Token-Request fehlgeschlagen: ${String(err)}`);
    }
    clearTimeout(timeout);
    const responseBody = await res.text().catch(() => '');
    console.log(`[DHL OAuth] Status: ${res.status}, URL: ${tokenUrl}`);
    console.log(`[DHL OAuth] Response: ${responseBody.slice(0, 500)}`);
    console.log(`[DHL OAuth] APIKey: [${process.env.DHL_API_KEY}]`);
    console.log(`[DHL OAuth] APISecret: [${process.env.DHL_API_SECRET}]`);
    console.log(`[DHL OAuth] base64 credentials: ${credentials}`);
    if (res.status === 401 || res.status === 403) {
        throw new types_1.TrackingProviderError('dhl', 'auth', `DHL OAuth: Consumer Key oder Secret ungültig (HTTP ${res.status}): ${responseBody.slice(0, 200)}`);
    }
    if (!res.ok) {
        throw new types_1.TrackingProviderError('dhl', 'unknown', `DHL Token-Fehler ${res.status}: ${responseBody.slice(0, 200)}`);
    }
    let data;
    try {
        data = JSON.parse(responseBody);
    }
    catch {
        throw new types_1.TrackingProviderError('dhl', 'unknown', `DHL Token-Response kein JSON: ${responseBody.slice(0, 200)}`);
    }
    if (!data.access_token) {
        throw new types_1.TrackingProviderError('dhl', 'unknown', `DHL Token leer in Response: ${responseBody.slice(0, 200)}`);
    }
    console.log('[DHL OAuth] Token erfolgreich abgerufen');
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 18000) * 1000;
    return cachedToken;
}
// ─── Provider ─────────────────────────────────────────────────────────────────
class DhlTrackingProvider {
    providerName = 'dhl';
    carrierKeys = ['dhl', 'deutsche post', 'deutschepost'];
    get mode() {
        if (process.env.DHL_API_USERNAME && process.env.DHL_API_PASSWORD)
            return 'express';
        if (process.env.DHL_API_KEY && process.env.DHL_API_SECRET)
            return 'oauth';
        if (process.env.DHL_API_KEY)
            return 'apikey';
        return 'none';
    }
    isConfigured() {
        return this.mode !== 'none';
    }
    async fetchTracking(trackingNumber) {
        const m = this.mode;
        if (m === 'none') {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'DHL-Zugangsdaten fehlen (DHL_API_KEY in .env setzen)');
        }
        if (m === 'express')
            return this.fetchExpress(trackingNumber);
        if (m === 'oauth')
            return this.fetchUnified(trackingNumber, true);
        return this.fetchUnified(trackingNumber, false);
    }
    // ── Modus A & B: DHL Unified Tracking (API Key oder OAuth2) ─────────────────
    async fetchUnified(trackingNumber, useOAuth) {
        let authHeader;
        if (useOAuth) {
            const token = await getOAuthToken();
            authHeader = `Bearer ${token}`;
        }
        else {
            authHeader = ''; // wird als DHL-API-Key gesetzt
        }
        // OAuth2 (Modus B / Deutsche Post International) nutzt api.dhl.com, einfacher API-Key nutzt api-eu.dhl.com
        const baseUrl = useOAuth
            ? (process.env.DHL_TRACKING_URL || 'https://api-eu.dhl.com/track/shipments')
            : 'https://api-eu.dhl.com/track/shipments';
        const url = `${baseUrl}?trackingNumber=${encodeURIComponent(trackingNumber)}`;
        const timeoutMs = Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const headers = { 'Accept': 'application/json' };
        if (useOAuth) {
            headers['Authorization'] = authHeader;
        }
        else {
            headers['DHL-API-Key'] = String(process.env.DHL_API_KEY);
        }
        let response;
        try {
            response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        }
        catch (err) {
            clearTimeout(timeout);
            const isAbort = err instanceof Error && err.name === 'AbortError';
            throw new types_1.TrackingProviderError(this.providerName, isAbort ? 'timeout' : 'network', String(err));
        }
        clearTimeout(timeout);
        if (response.status === 401 || response.status === 403) {
            // Bei OAuth: Token könnte abgelaufen sein → Cache leeren
            if (useOAuth) {
                cachedToken = null;
                tokenExpiresAt = 0;
            }
            throw new types_1.TrackingProviderError(this.providerName, 'auth', useOAuth
                ? 'DHL OAuth Token ungültig – Consumer Key/Secret prüfen'
                : 'DHL API Key ungültig – DHL_API_KEY in .env prüfen');
        }
        if (response.status === 404) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Sendung ${trackingNumber} nicht gefunden`);
        }
        if (response.status === 429) {
            throw new types_1.TrackingProviderError(this.providerName, 'rate_limit', 'DHL API Rate-Limit erreicht');
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new types_1.TrackingProviderError(this.providerName, 'unknown', `DHL Fehler ${response.status}: ${body}`);
        }
        const data = await response.json();
        const shipment = data.shipments?.[0];
        if (!shipment) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', 'Keine Sendungsdaten in der Antwort');
        }
        let internalStatus = (0, normalization_1.normalizeCarrierStatus)(shipment.status?.statusCode || shipment.status?.status, DHL_UNIFIED_STATUS_MAP);
        const events = (0, normalization_1.dedupeEvents)((shipment.events || []).map((event) => {
            const desc = event.description || event.status || 'Status-Update';
            const location = event.location?.address?.addressLocality || '';
            let evStatus = (0, normalization_1.normalizeCarrierStatus)(event.statusCode || event.status, DHL_UNIFIED_STATUS_MAP);
            if ((0, normalization_1.detectPackstationFromDescription)(desc))
                evStatus = 'in_packstation';
            return { timestamp: new Date(event.timestamp), location, status: (0, normalization_1.internalStatusToDb)(evStatus), description: desc };
        }));
        if ((0, normalization_1.detectPackstationFromDescription)(shipment.status?.description || '')) {
            internalStatus = 'in_packstation';
        }
        return {
            provider: this.providerName,
            internalStatus,
            status: (0, normalization_1.internalStatusToDb)(internalStatus),
            events,
            estimatedDelivery: shipment.estimatedTimeOfDelivery
                ? new Date(shipment.estimatedTimeOfDelivery)
                : undefined,
        };
    }
    // ── Modus C: DHL Express (MyDHL API, Business) ───────────────────────────────
    async fetchExpress(trackingNumber) {
        const credentials = Buffer.from(`${process.env.DHL_API_USERNAME}:${process.env.DHL_API_PASSWORD}`).toString('base64');
        const url = `https://express.api.dhl.com/mydhlapi/shipments/${encodeURIComponent(trackingNumber)}/tracking` +
            `?trackingView=all-checkpoints`;
        const timeoutMs = Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' },
                signal: controller.signal,
            });
        }
        catch (err) {
            clearTimeout(timeout);
            const isAbort = err instanceof Error && err.name === 'AbortError';
            throw new types_1.TrackingProviderError(this.providerName, isAbort ? 'timeout' : 'network', String(err));
        }
        clearTimeout(timeout);
        if (response.status === 401 || response.status === 403) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'DHL Express Authentifizierung fehlgeschlagen');
        }
        if (response.status === 404) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', `Sendung ${trackingNumber} nicht gefunden`);
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new types_1.TrackingProviderError(this.providerName, 'unknown', `DHL Express Fehler ${response.status}: ${body}`);
        }
        const data = await response.json();
        const shipment = data.shipments?.[0];
        if (!shipment) {
            throw new types_1.TrackingProviderError(this.providerName, 'not_found', 'Keine Sendungsdaten');
        }
        const rawEvents = shipment.events || [];
        const mappedEvents = rawEvents.map((event) => {
            const desc = event.description || event.typeCode;
            const location = event.serviceArea?.[0]?.description || '';
            const timestamp = new Date(`${event.date}T${event.time}`);
            let evStatus = DHL_EXPRESS_TYPECODE_MAP[event.typeCode?.toUpperCase()] ?? 'in_transit';
            if ((0, normalization_1.detectPackstationFromDescription)(desc))
                evStatus = 'in_packstation';
            return { timestamp, location, status: (0, normalization_1.internalStatusToDb)(evStatus), description: desc };
        });
        const uniqueEvents = (0, normalization_1.dedupeEvents)(mappedEvents);
        let internalStatus = 'in_transit';
        if (rawEvents.length > 0) {
            const sorted = [...rawEvents].sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());
            internalStatus = DHL_EXPRESS_TYPECODE_MAP[sorted[0].typeCode?.toUpperCase()] ?? 'in_transit';
            if ((0, normalization_1.detectPackstationFromDescription)(sorted[0].description))
                internalStatus = 'in_packstation';
        }
        return {
            provider: this.providerName,
            internalStatus,
            status: (0, normalization_1.internalStatusToDb)(internalStatus),
            events: uniqueEvents,
            estimatedDelivery: shipment.estimatedDeliveryDate ? new Date(shipment.estimatedDeliveryDate) : undefined,
        };
    }
}
exports.DhlTrackingProvider = DhlTrackingProvider;
//# sourceMappingURL=dhl.js.map