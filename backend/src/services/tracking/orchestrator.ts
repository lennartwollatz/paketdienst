import { isDhlShipment } from './dhlDetection';
import { dedupeEvents } from './normalization';
import { DhlWebTrackingProvider } from './providers/dhlWeb';
import { TrackingMoreProvider } from './providers/trackingmore';
import { TrackingProviderError, TrackingResult } from './types';

const trackingMoreProvider = new TrackingMoreProvider();
const dhlWebProvider = new DhlWebTrackingProvider();

function isQuotaOrCapacityError(err: unknown): boolean {
  return err instanceof TrackingProviderError && err.type === 'rate_limit';
}

function sortTrackingResult(result: TrackingResult): TrackingResult {
  return {
    ...result,
    events: dedupeEvents(result.events).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    ),
  };
}

async function tryDhlWebTracking(trackingNumber: string): Promise<TrackingResult | null> {
  try {
    console.log(`[tracking] DHL-Web-Tracking für ${trackingNumber} (dhl.de Sendungsverfolgung)`);
    return await dhlWebProvider.fetchTracking(trackingNumber);
  } catch (err) {
    console.warn('[tracking] DHL-Web-Tracking fehlgeschlagen:', (err as Error).message);
    return null;
  }
}

async function tryTrackingMore(
  trackingNumber: string,
): Promise<TrackingResult | null> {
  if (!trackingMoreProvider.isConfigured()) return null;
  return trackingMoreProvider.fetchTracking(trackingNumber);
}

/**
 * Sendungsverfolgung:
 * - DHL: Webseiten-Abruf (dhl.de) + KI-Statusanalyse, optional TrackingMore als Fallback
 * - Andere Carrier: TrackingMore
 */
export async function fetchTrackingFromProvider(
  trackingNumber: string,
  carrier?: string,
): Promise<TrackingResult> {
  if (isDhlShipment(trackingNumber, carrier)) {
    const webResult = await tryDhlWebTracking(trackingNumber);
    if (webResult) return sortTrackingResult(webResult);

    if (trackingMoreProvider.isConfigured()) {
      try {
        const tmResult = await tryTrackingMore(trackingNumber);
        if (tmResult) return sortTrackingResult(tmResult);
      } catch (err) {
        if (!isQuotaOrCapacityError(err)) throw err;
      }
    }

    throw new TrackingProviderError(
      'dhl-web',
      'unknown',
      'DHL-Sendungsverfolgung fehlgeschlagen (Webseite und TrackingMore)',
    );
  }

  if (!trackingMoreProvider.isConfigured()) {
    throw new TrackingProviderError(
      'trackingmore',
      'auth',
      'Tracking erfordert TRACKINGMORE_API_KEY (https://admin.trackingmore.com/developer/apikey)',
    );
  }

  const result = await tryTrackingMore(trackingNumber);
  if (!result) {
    throw new TrackingProviderError('trackingmore', 'unknown', 'Keine Tracking-Daten erhalten');
  }
  return sortTrackingResult(result);
}

export function isLegacyFallbackEnabled(): boolean {
  return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
