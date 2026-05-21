import { dedupeEvents } from './normalization';
import { DhlTrackingProvider } from './providers/dhl';
import { TrackingMoreProvider } from './providers/trackingmore';
import { TrackingProviderError, TrackingResult } from './types';

const trackingMoreProvider = new TrackingMoreProvider();
const dhlProvider = new DhlTrackingProvider();

function isQuotaOrCapacityError(err: unknown): boolean {
  return err instanceof TrackingProviderError && err.type === 'rate_limit';
}

function looksLikeDhlNumber(trackingNumber: string): boolean {
  return /^(00|JJD|JVGL|0034)/i.test(trackingNumber.trim());
}

async function tryDirectCarrierFallback(
  trackingNumber: string,
  carrier?: string,
): Promise<TrackingResult | null> {
  const carrierNorm = carrier?.trim().toLowerCase() ?? '';
  const dhlCandidate =
    dhlProvider.isConfigured()
    && (
      carrierNorm.includes('dhl')
      || carrierNorm.includes('deutsche post')
      || looksLikeDhlNumber(trackingNumber)
    );

  if (!dhlCandidate) return null;

  try {
    console.log(`[tracking] TrackingMore nicht verfügbar – DHL-Direktabfrage für ${trackingNumber}`);
    return await dhlProvider.fetchTracking(trackingNumber);
  } catch (err) {
    console.warn('[tracking] DHL-Fallback fehlgeschlagen:', (err as Error).message);
    return null;
  }
}

/**
 * Sendungsverfolgung: primär TrackingMore (Carrier-Erkennung), bei Kontingent-Problemen
 * optional DHL-Direktzugang als Fallback.
 */
export async function fetchTrackingFromProvider(
  trackingNumber: string,
  carrier?: string,
): Promise<TrackingResult> {
  if (!trackingMoreProvider.isConfigured()) {
    const fallback = await tryDirectCarrierFallback(trackingNumber, carrier);
    if (fallback) {
      return {
        ...fallback,
        events: dedupeEvents(fallback.events).sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
        ),
      };
    }
    throw new TrackingProviderError(
      'trackingmore',
      'auth',
      'Tracking erfordert TRACKINGMORE_API_KEY (https://admin.trackingmore.com/developer/apikey)',
    );
  }

  try {
    const result = await trackingMoreProvider.fetchTracking(trackingNumber);
    return {
      ...result,
      events: dedupeEvents(result.events).sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      ),
    };
  } catch (err) {
    if (isQuotaOrCapacityError(err)) {
      const fallback = await tryDirectCarrierFallback(trackingNumber, carrier);
      if (fallback) {
        return {
          ...fallback,
          events: dedupeEvents(fallback.events).sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
          ),
        };
      }
    }
    throw err;
  }
}

export function isLegacyFallbackEnabled(): boolean {
  return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}
