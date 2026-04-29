"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DpdTrackingProvider = void 0;
const normalization_1 = require("../normalization");
const types_1 = require("../types");
const types_2 = require("./types");
const DPD_STATUS_MAP = {
    created: 'info_received',
    in_transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    exception: 'exception',
};
class DpdTrackingProvider {
    providerName = 'dpd';
    carrierKeys = ['dpd'];
    isConfigured() {
        return Boolean(process.env.DPD_CLIENT_ID && process.env.DPD_CLIENT_SECRET);
    }
    async fetchTracking(trackingNumber) {
        if (!this.isConfigured()) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'DPD API Zugangsdaten fehlen');
        }
        const url = `https://api.dpd.com/track/v1/shipments/${encodeURIComponent(trackingNumber)}`;
        const data = await (0, types_2.fetchJsonWithTimeout)(url, {
            method: 'GET',
            headers: {
                'X-Client-Id': String(process.env.DPD_CLIENT_ID),
                'X-Client-Secret': String(process.env.DPD_CLIENT_SECRET),
            },
        }, Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000), this.providerName);
        const internalStatus = (0, normalization_1.normalizeCarrierStatus)(data.statusCode || data.statusText, DPD_STATUS_MAP);
        const events = (0, normalization_1.dedupeEvents)((data.events || []).map((event) => ({
            timestamp: new Date(event.timestamp),
            location: event.location || '',
            status: (0, normalization_1.internalStatusToLabel)((0, normalization_1.normalizeCarrierStatus)(event.statusCode || event.statusText, DPD_STATUS_MAP)),
            description: event.description || event.statusText || 'Status-Update',
        })));
        return {
            provider: this.providerName,
            internalStatus,
            status: (0, normalization_1.internalStatusToLabel)(internalStatus),
            events,
            estimatedDelivery: data.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined,
        };
    }
}
exports.DpdTrackingProvider = DpdTrackingProvider;
//# sourceMappingURL=dpd.js.map