import { TrackingProviderError } from '../types';

export interface ProviderApiEvent {
  timestamp: string;
  location?: string;
  statusCode?: string;
  statusText?: string;
  description?: string;
}

export interface ProviderApiResponse {
  statusCode?: string;
  statusText?: string;
  description?: string;
  estimatedDelivery?: string;
  events?: ProviderApiEvent[];
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  providerName: string
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 401 || response.status === 403) {
      throw new TrackingProviderError(providerName, 'auth', 'Authentifizierung fehlgeschlagen');
    }
    if (response.status === 404) {
      throw new TrackingProviderError(providerName, 'not_found', 'Sendung nicht gefunden');
    }
    if (response.status === 429) {
      throw new TrackingProviderError(providerName, 'rate_limit', 'Rate Limit erreicht', true);
    }
    if (!response.ok) {
      throw new TrackingProviderError(
        providerName,
        'network',
        `Carrier API Fehler: HTTP ${response.status}`,
        response.status >= 500
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TrackingProviderError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TrackingProviderError(providerName, 'timeout', 'Carrier API Timeout', true);
    }
    throw new TrackingProviderError(providerName, 'unknown', 'Unbekannter Carrier API Fehler', true);
  } finally {
    clearTimeout(timeout);
  }
}
