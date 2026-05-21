import { dedupeEvents } from './normalization';
import { TrackingMoreProvider } from './providers/trackingmore';
import { TrackingProviderError, TrackingResult } from './types';

/**
 * Alle Sendungsverfolgungen laufen ausschließlich über TrackingMore.
 * Der Carrier wird immer per API erkannt (couriers/detect), nicht aus der Bestellung übernommen.
 */
const trackingMoreProvider = new TrackingMoreProvider();

export async function fetchTrackingFromProvider(
  trackingNumber: string,
  _carrier?: string,
): Promise<TrackingResult> {
  if (!trackingMoreProvider.isConfigured()) {
    throw new TrackingProviderError(
      'trackingmore',
      'auth',
      'Tracking erfordert TRACKINGMORE_API_KEY (https://admin.trackingmore.com/developer/apikey)',
    );
  }

  const result = await trackingMoreProvider.fetchTracking(trackingNumber);
  return {
    ...result,
    events: dedupeEvents(result.events).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    ),
  };
}

export function isLegacyFallbackEnabled(): boolean {
  return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
