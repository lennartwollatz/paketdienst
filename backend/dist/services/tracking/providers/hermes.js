"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HermesTrackingProvider = void 0;
const normalization_1 = require("../normalization");
const types_1 = require("../types");
const types_2 = require("./types");
const HERMES_STATUS_MAP = {
    announced: 'info_received',
    in_distribution: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    issue: 'exception',
};
class HermesTrackingProvider {
    providerName = 'hermes';
    carrierKeys = ['hermes', 'myhermes'];
    isConfigured() {
        return Boolean(process.env.HERMES_API_KEY);
    }
    async fetchTracking(trackingNumber) {
        if (!this.isConfigured()) {
            throw new types_1.TrackingProviderError(this.providerName, 'auth', 'Hermes API Key fehlt');
        }
        const url = `https://api.myhermes.de/shipments/${encodeURIComponent(trackingNumber)}/tracking`;
        const data = await (0, types_2.fetchJsonWithTimeout)(url, { method: 'GET', headers: { Authorization: `Bearer ${String(process.env.HERMES_API_KEY)}` } }, Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000), this.providerName);
        let internalStatus = (0, normalization_1.normalizeCarrierStatus)(data.statusCode || data.statusText, HERMES_STATUS_MAP);
        const events = (0, normalization_1.dedupeEvents)((data.events || []).map((event) => {
            const desc = event.description || event.statusText || 'Status-Update';
            let evStatus = (0, normalization_1.normalizeCarrierStatus)(event.statusCode || event.statusText, HERMES_STATUS_MAP);
            if ((0, normalization_1.detectPackstationFromDescription)(desc))
                evStatus = 'in_packstation';
            return { timestamp: new Date(event.timestamp), location: event.location || '', status: (0, normalization_1.internalStatusToDb)(evStatus), description: desc };
        }));
        if ((0, normalization_1.detectPackstationFromDescription)(data.description || data.statusText || '')) {
            internalStatus = 'in_packstation';
        }
        return { provider: this.providerName, internalStatus, status: (0, normalization_1.internalStatusToDb)(internalStatus), events, estimatedDelivery: data.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined };
    }
}
exports.HermesTrackingProvider = HermesTrackingProvider;
//# sourceMappingURL=hermes.js.map