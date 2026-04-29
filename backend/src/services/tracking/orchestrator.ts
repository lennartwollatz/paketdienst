import { dedupeEvents } from './normalization';
import { DhlTrackingProvider } from './providers/dhl';
import { DpdTrackingProvider } from './providers/dpd';
import { GlsTrackingProvider } from './providers/gls';
import { HermesTrackingProvider } from './providers/hermes';
import { TrackingMoreProvider } from './providers/trackingmore';
import { UpsTrackingProvider } from './providers/ups';
import { TrackingProvider, TrackingProviderError, TrackingResult } from './types';

/**
 * TrackingMore ist der universelle Provider und hat Vorrang,
 * sofern TRACKINGMORE_API_KEY gesetzt ist.
 * Die einzelnen Carrier-Provider dienen als Fallback.
 */
const trackingMoreProvider = new TrackingMoreProvider();

const fallbackProviders: TrackingProvider[] = [
  new DhlTrackingProvider(),
  new UpsTrackingProvider(),
  new HermesTrackingProvider(),
  new DpdTrackingProvider(),
  new GlsTrackingProvider(),
];

function normalizeCarrierKey(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function findFallbackProvider(carrier?: string): TrackingProvider | null {
  const key = normalizeCarrierKey(carrier);
  if (!key) return null;
  return fallbackProviders.find((p) => p.carrierKeys.includes(key)) || null;
}

export async function fetchTrackingFromProvider(
  trackingNumber: string,
  carrier?: string,
): Promise<TrackingResult> {
  // ── Primär: TrackingMore ──────────────────────────────────────────────────
  if (trackingMoreProvider.isConfigured()) {
    const key = normalizeCarrierKey(carrier);
    const supportedByTm = trackingMoreProvider.carrierKeys.includes(key);
    if (supportedByTm) {
      const result = await trackingMoreProvider.fetchTracking(trackingNumber, carrier);
      return {
        ...result,
        events: dedupeEvents(result.events).sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
        ),
      };
    }
  }

  // ── Fallback: einzelne Carrier-Provider ──────────────────────────────────
  const provider = findFallbackProvider(carrier);
  if (!provider) {
    throw new TrackingProviderError(
      'registry', 'not_found',
      `Unbekannter Carrier: ${carrier || 'leer'}`,
    );
  }
  if (!provider.isConfigured()) {
    throw new TrackingProviderError(
      provider.providerName, 'auth',
      `Provider ${provider.providerName} ist nicht konfiguriert`,
    );
  }

  const result = await provider.fetchTracking(trackingNumber, carrier);
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
