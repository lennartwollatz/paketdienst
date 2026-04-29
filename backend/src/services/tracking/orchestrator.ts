import { dedupeEvents } from './normalization';
import { DhlTrackingProvider } from './providers/dhl';
import { DpdTrackingProvider } from './providers/dpd';
import { GlsTrackingProvider } from './providers/gls';
import { HermesTrackingProvider } from './providers/hermes';
import { UpsTrackingProvider } from './providers/ups';
import { TrackingProvider, TrackingProviderError, TrackingResult } from './types';

const providers: TrackingProvider[] = [
  new DhlTrackingProvider(),
  new UpsTrackingProvider(),
  new HermesTrackingProvider(),
  new DpdTrackingProvider(),
  new GlsTrackingProvider(),
];

function normalizeCarrierKey(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function findProvider(carrier?: string): TrackingProvider | null {
  const key = normalizeCarrierKey(carrier);
  if (!key) return null;
  return providers.find((provider) => provider.carrierKeys.includes(key)) || null;
}

function shouldAllowLegacyFallback(): boolean {
  return process.env.TRACKING_ENABLE_LEGACY_FALLBACK === 'true';
}

export async function fetchTrackingFromProvider(
  trackingNumber: string,
  carrier?: string
): Promise<TrackingResult> {
  const provider = findProvider(carrier);
  if (!provider) {
    throw new TrackingProviderError('registry', 'not_found', `Unbekannter Carrier: ${carrier || 'leer'}`);
  }
  if (!provider.isConfigured()) {
    throw new TrackingProviderError(provider.providerName, 'auth', `Provider ${provider.providerName} ist nicht konfiguriert`);
  }

  const result = await provider.fetchTracking(trackingNumber);
  return {
    ...result,
    events: dedupeEvents(result.events).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    ),
  };
}

export function isLegacyFallbackEnabled(): boolean {
  return shouldAllowLegacyFallback();
}
