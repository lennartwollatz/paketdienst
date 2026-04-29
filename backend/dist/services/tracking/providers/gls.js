"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlsTrackingProvider = void 0;
const normalization_1 = require("../normalization");
const types_1 = require("../types");
const types_2 = require("./types");
const GLS_STATUS_MAP = {
    preadvice: 'info_received',
    in_transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    incident: 'exception',
};
class GlsTrackingProvider {
    providerName = 'gls';
    carrierKeys = ['gls'];
    isConfigured() {
        return Boolean(process.env.GLS_API_KEY);
    }
    async fetchTracking(trackingNumber) {
        if (!this.isConfigured()) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'GLS API Key fehlt');
        }
        const url = `https://api.gls-group.eu/public/v1/shipments/${encodeURIComponent(trackingNumber)}/tracking`;
        const data = await (0, types_2.fetchJsonWithTimeout)(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${String(process.env.GLS_API_KEY)}` },
        }, Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000), this.providerName);
        const internalStatus = (0, normalization_1.normalizeCarrierStatus)(data.statusCode || data.statusText, GLS_STATUS_MAP);
        const events = (0, normalization_1.dedupeEvents)((data.events || []).map((event) => ({
            timestamp: new Date(event.timestamp),
            location: event.location || '',
            status: (0, normalization_1.internalStatusToLabel)((0, normalization_1.normalizeCarrierStatus)(event.statusCode || event.statusText, GLS_STATUS_MAP)),
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
exports.GlsTrackingProvider = GlsTrackingProvider;
//# sourceMappingURL=gls.js.map