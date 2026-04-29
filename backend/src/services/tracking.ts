import { fetchTrackingFromProvider, isLegacyFallbackEnabled } from './tracking/orchestrator';
import { TrackingResult } from './tracking/types';

export async function getTrackingInfo(
  trackingNumber: string,
  carrier?: string
): Promise<TrackingResult> {
  try {
    return await fetchTrackingFromProvider(trackingNumber, carrier);
  } catch (error) {
    console.error('Carrier-Tracking fehlgeschlagen:', error);
    if (!isLegacyFallbackEnabled()) throw error;
    return generateMockTracking(trackingNumber);
  }
}

function generateMockTracking(trackingNumber: string): TrackingResult {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

  return {
    provider: 'mock',
    internalStatus: 'in_transit',
    status: 'in transit',
    estimatedDelivery: new Date(now.getTime() + 86400000),
    events: [
      {
        timestamp: now,
        location: 'Frankfurt, Deutschland',
        status: 'in transit',
        description: 'Paket im Verteilzentrum angekommen',
      },
      {
        timestamp: yesterday,
        location: 'München, Deutschland',
        status: 'in transit',
        description: 'Paket auf dem Weg zum nächsten Verteilzentrum',
      },
      {
        timestamp: twoDaysAgo,
        location: 'Hamburg, Deutschland',
        status: 'in transit',
        description: 'Paket beim Absender abgeholt',
      },
      {
        timestamp: threeDaysAgo,
        location: 'Online',
        status: 'processing',
        description: `Sendungsdaten für ${trackingNumber} empfangen`,
      },
    ],
  };
}
