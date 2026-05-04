"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTrackingFromProvider = fetchTrackingFromProvider;
exports.isLegacyFallbackEnabled = isLegacyFallbackEnabled;
const normalization_1 = require("./normalization");
const dhl_1 = require("./providers/dhl");
const dpd_1 = require("./providers/dpd");
const gls_1 = require("./providers/gls");
const hermes_1 = require("./providers/hermes");
const trackingmore_1 = require("./providers/trackingmore");
const ups_1 = require("./providers/ups");
const types_1 = require("./types");
/**
 * TrackingMore ist der universelle Provider und hat Vorrang,
 * sofern TRACKINGMORE_API_KEY gesetzt ist.
 * Die einzelnen Carrier-Provider dienen als Fallback.
 */
const trackingMoreProvider = new trackingmore_1.TrackingMoreProvider();
const fallbackProviders = [
    new dhl_1.DhlTrackingProvider(),
    new ups_1.UpsTrackingProvider(),
    new hermes_1.HermesTrackingProvider(),
    new dpd_1.DpdTrackingProvider(),
    new gls_1.GlsTrackingProvider(),
];
function normalizeCarrierKey(value) {
    return (value || '').trim().toLowerCase();
}
function findFallbackProvider(carrier) {
    const key = normalizeCarrierKey(carrier);
    if (!key)
        return null;
    return fallbackProviders.find((p) => p.carrierKeys.includes(key)) || null;
}
async function fetchTrackingFromProvider(trackingNumber, carrier) {
    // ── Primär: TrackingMore ──────────────────────────────────────────────────
    if (trackingMoreProvider.isConfigured()) {
        const key = normalizeCarrierKey(carrier);
        const supportedByTm = trackingMoreProvider.carrierKeys.includes(key);
        if (supportedByTm) {
            const result = await trackingMoreProvider.fetchTracking(trackingNumber, carrier);
            return {
                ...result,
                events: (0, normalization_1.dedupeEvents)(result.events).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
            };
        }
    }
    // ── Fallback: einzelne Carrier-Provider ──────────────────────────────────
    const provider = findFallbackProvider(carrier);
    if (!provider) {
        throw new types_1.TrackingProviderError('registry', 'not_found', `Unbekannter Carrier: ${carrier || 'leer'}`);
    }
    if (!provider.isConfigured()) {
        throw new types_1.TrackingProviderError(provider.providerName, 'auth', `Provider ${provider.providerName} ist nicht konfiguriert`);
    }
    const result = await provider.fetchTracking(trackingNumber, carrier);
    return {
        ...result,
        events: (0, normalization_1.dedupeEvents)(result.events).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    };
}
function isLegacyFallbackEnabled() {
    return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
//# sourceMappingURL=orchestrator.js.map