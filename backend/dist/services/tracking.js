"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrackingInfo = getTrackingInfo;
const orchestrator_1 = require("./tracking/orchestrator");
async function getTrackingInfo(trackingNumber, carrier) {
    try {
        return await (0, orchestrator_1.fetchTrackingFromProvider)(trackingNumber, carrier);
    }
    catch (error) {
        console.error('Carrier-Tracking fehlgeschlagen:', error);
        if (!(0, orchestrator_1.isLegacyFallbackEnabled)())
            throw error;
        return generateMockTracking(trackingNumber);
    }
}
function generateMockTracking(trackingNumber) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
    return {
        provider: 'mock',
        internalStatus: 'in_transit',
        status: 'In Transit',
        estimatedDelivery: new Date(now.getTime() + 86400000),
        events: [
            {
                timestamp: now,
                location: 'Frankfurt, Deutschland',
                status: 'In Transit',
                description: 'Paket im Verteilzentrum angekommen',
            },
            {
                timestamp: yesterday,
                location: 'München, Deutschland',
                status: 'In Transit',
                description: 'Paket auf dem Weg zum nächsten Verteilzentrum',
            },
            {
                timestamp: twoDaysAgo,
                location: 'Hamburg, Deutschland',
                status: 'In Transit',
                description: 'Paket beim Absender abgeholt',
            },
            {
                timestamp: threeDaysAgo,
                location: 'Online',
                status: 'Informationen erhalten',
                description: `Sendungsdaten für ${trackingNumber} empfangen`,
            },
        ],
    };
}
//# sourceMappingURL=tracking.js.map