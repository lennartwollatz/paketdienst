"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DhlTrackingProvider = void 0;
const normalization_1 = require("../normalization");
const types_1 = require("../types");
const types_2 = require("./types");
const DHL_STATUS_MAP = {
    information_received: 'info_received',
    transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    exception: 'exception',
};
class DhlTrackingProvider {
    providerName = 'dhl';
    carrierKeys = ['dhl', 'deutsche post', 'deutschepost'];
    isConfigured() {
        return Boolean(process.env.DHL_API_KEY);
    }
    async fetchTracking(trackingNumber) {
        if (!this.isConfigured()) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'DHL API Key fehlt');
        }
        const url = `https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`;
        const data = await (0, types_2.fetchJsonWithTimeout)(url, {
            method: 'GET',
            headers: { 'DHL-API-Key': String(process.env.DHL_API_KEY) },
        }, Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000), this.providerName);
        const internalStatus = (0, normalization_1.normalizeCarrierStatus)(data.statusCode || data.statusText, DHL_STATUS_MAP);
        const events = (0, normalization_1.dedupeEvents)((data.events || []).map((event) => ({
            timestamp: new Date(event.timestamp),
            location: event.location || '',
            status: (0, normalization_1.internalStatusToLabel)((0, normalization_1.normalizeCarrierStatus)(event.statusCode || event.statusText, DHL_STATUS_MAP)),
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
exports.DhlTrackingProvider = DhlTrackingProvider;
//# sourceMappingURL=dhl.js.map