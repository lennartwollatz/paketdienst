import { isDhlShipment } from './dhlDetection';
import { dedupeEvents } from './normalization';
import { DhlTrackingProvider } from './providers/dhl';
import { DhlWebTrackingProvider } from './providers/dhlWeb';
import { TrackingMoreProvider } from './providers/trackingmore';
import { TrackingProviderError, TrackingResult } from './types';

const trackingMoreProvider = new TrackingMoreProvider();
const dhlApiProvider = new DhlTrackingProvider();
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

async function tryDhlApiFallback(trackingNumber: string): Promise<TrackingResult | null> {
  if (!dhlApiProvider.isConfigured()) return null;

  try {
    console.log(`[tracking] DHL-API-Fallback für ${trackingNumber}`);
    return await dhlApiProvider.fetchTracking(trackingNumber);
  } catch (err) {
    console.warn('[tracking] DHL-API-Fallback fehlgeschlagen:', (err as Error).message);
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
 * - DHL: primär Webseiten-Abruf (dhl.de) + KI-Statusanalyse, dann API/TrackingMore als Fallback
 * - Andere Carrier: TrackingMore
 */
export async function fetchTrackingFromProvider(
  trackingNumber: string,
  carrier?: string,
): Promise<TrackingResult> {
  if (isDhlShipment(trackingNumber, carrier)) {
    const webResult = await tryDhlWebTracking(trackingNumber);
    if (webResult) return sortTrackingResult(webResult);

    const apiResult = await tryDhlApiFallback(trackingNumber);
    if (apiResult) return sortTrackingResult(apiResult);

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
      'DHL-Sendungsverfolgung fehlgeschlagen (Webseite, API und TrackingMore)',
    );
  }

  if (!trackingMoreProvider.isConfigured()) {
    throw new TrackingProviderError(
      'trackingmore',
      'auth',
      'Tracking erfordert TRACKINGMORE_API_KEY (https://admin.trackingmore.com/developer/apikey)',
    );
  }

  try {
    const result = await tryTrackingMore(trackingNumber);
    if (!result) {
      throw new TrackingProviderError('trackingmore', 'unknown', 'Keine Tracking-Daten erhalten');
    }
    return sortTrackingResult(result);
  } catch (err) {
    if (isQuotaOrCapacityError(err)) {
      const apiResult = await tryDhlApiFallback(trackingNumber);
      if (apiResult) return sortTrackingResult(apiResult);
    }
    throw err;
  }
}

export function isLegacyFallbackEnabled(): boolean {
  return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
