"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTrackingFromProvider = fetchTrackingFromProvider;
exports.isLegacyFallbackEnabled = isLegacyFallbackEnabled;
const dhlDetection_1 = require("./dhlDetection");
const normalization_1 = require("./normalization");
const dhlWeb_1 = require("./providers/dhlWeb");
const trackingmore_1 = require("./providers/trackingmore");
const types_1 = require("./types");
const trackingMoreProvider = new trackingmore_1.TrackingMoreProvider();
const dhlWebProvider = new dhlWeb_1.DhlWebTrackingProvider();
function isQuotaOrCapacityError(err) {
    return err instanceof types_1.TrackingProviderError && err.type === 'rate_limit';
}
function sortTrackingResult(result) {
    return {
        ...result,
        events: (0, normalization_1.dedupeEvents)(result.events).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    };
}
async function tryDhlWebTracking(trackingNumber) {
    try {
        console.log(`[tracking] DHL-Web-Tracking für ${trackingNumber} (dhl.de Sendungsverfolgung)`);
        return await dhlWebProvider.fetchTracking(trackingNumber);
    }
    catch (err) {
        console.warn('[tracking] DHL-Web-Tracking fehlgeschlagen:', err.message);
        return null;
    }
}
async function tryTrackingMore(trackingNumber) {
    if (!trackingMoreProvider.isConfigured())
        return null;
    return trackingMoreProvider.fetchTracking(trackingNumber);
}
/**
 * Sendungsverfolgung:
 * - DHL: Webseiten-Abruf (dhl.de) + KI-Statusanalyse, optional TrackingMore als Fallback
 * - Andere Carrier: TrackingMore
 */
async function fetchTrackingFromProvider(trackingNumber, carrier) {
    if ((0, dhlDetection_1.isDhlShipment)(trackingNumber, carrier)) {
        const webResult = await tryDhlWebTracking(trackingNumber);
        if (webResult)
            return sortTrackingResult(webResult);
        if (trackingMoreProvider.isConfigured()) {
            try {
                const tmResult = await tryTrackingMore(trackingNumber);
                if (tmResult)
                    return sortTrackingResult(tmResult);
            }
            catch (err) {
                if (!isQuotaOrCapacityError(err))
                    throw err;
            }
        }
        throw new types_1.TrackingProviderError('dhl-web', 'unknown', 'DHL-Sendungsverfolgung fehlgeschlagen (Webseite und TrackingMore)');
    }
    if (!trackingMoreProvider.isConfigured()) {
        throw new types_1.TrackingProviderError('trackingmore', 'auth', 'Tracking erfordert TRACKINGMORE_API_KEY (https://admin.trackingmore.com/developer/apikey)');
    }
    const result = await tryTrackingMore(trackingNumber);
    if (!result) {
        throw new types_1.TrackingProviderError('trackingmore', 'unknown', 'Keine Tracking-Daten erhalten');
    }
    return sortTrackingResult(result);
}
function isLegacyFallbackEnabled() {
    return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
//# sourceMappingURL=orchestrator.js.map