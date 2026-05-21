"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTrackingFromProvider = fetchTrackingFromProvider;
exports.isLegacyFallbackEnabled = isLegacyFallbackEnabled;
const normalization_1 = require("./normalization");
const trackingmore_1 = require("./providers/trackingmore");
const types_1 = require("./types");
/**
 * Alle Sendungsverfolgungen laufen ausschließlich über TrackingMore.
 * Der Carrier wird immer per API erkannt (couriers/detect), nicht aus der Bestellung übernommen.
 */
const trackingMoreProvider = new trackingmore_1.TrackingMoreProvider();
async function fetchTrackingFromProvider(trackingNumber, _carrier) {
    if (!trackingMoreProvider.isConfigured()) {
        throw new types_1.TrackingProviderError('trackingmore', 'auth', 'Tracking erfordert TRACKINGMORE_API_KEY (https://admin.trackingmore.com/developer/apikey)');
    }
    const result = await trackingMoreProvider.fetchTracking(trackingNumber);
    return {
        ...result,
        events: (0, normalization_1.dedupeEvents)(result.events).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    };
}
function isLegacyFallbackEnabled() {
    return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
//# sourceMappingURL=orchestrator.js.map