"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTrackingFromProvider = fetchTrackingFromProvider;
exports.isLegacyFallbackEnabled = isLegacyFallbackEnabled;
const normalization_1 = require("./normalization");
const dhl_1 = require("./providers/dhl");
const dpd_1 = require("./providers/dpd");
const gls_1 = require("./providers/gls");
const hermes_1 = require("./providers/hermes");
const ups_1 = require("./providers/ups");
const types_1 = require("./types");
const providers = [
    new dhl_1.DhlTrackingProvider(),
    new ups_1.UpsTrackingProvider(),
    new hermes_1.HermesTrackingProvider(),
    new dpd_1.DpdTrackingProvider(),
    new gls_1.GlsTrackingProvider(),
];
function normalizeCarrierKey(value) {
    return (value || '').trim().toLowerCase();
}
function findProvider(carrier) {
    const key = normalizeCarrierKey(carrier);
    if (!key)
        return null;
    return providers.find((provider) => provider.carrierKeys.includes(key)) || null;
}
function shouldAllowLegacyFallback() {
    return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
async function fetchTrackingFromProvider(trackingNumber, carrier) {
    const provider = findProvider(carrier);
    if (!provider) {
        throw new types_1.TrackingProviderError('registry', 'not_found', `Unbekannter Carrier: ${carrier || 'leer'}`);
    }
    if (!provider.isConfigured()) {
        throw new types_1.TrackingProviderError(provider.providerName, 'auth', `Provider ${provider.providerName} ist nicht konfiguriert`);
    }
    const result = await provider.fetchTracking(trackingNumber);
    return {
        ...result,
        events: (0, normalization_1.dedupeEvents)(result.events).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    };
}
function isLegacyFallbackEnabled() {
    return shouldAllowLegacyFallback();
}
//# sourceMappingURL=orchestrator.js.map