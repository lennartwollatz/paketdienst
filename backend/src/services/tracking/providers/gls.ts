import { dedupeEvents, detectPackstationFromDescription, internalStatusToDb, normalizeCarrierStatus } from '../normalization';
import { InternalTrackingStatus, TrackingProvider, TrackingProviderError, TrackingResult } from '../types';
import { fetchJsonWithTimeout, ProviderApiResponse } from './types';

const GLS_STATUS_MAP: Record<string, InternalTrackingStatus> = {
  preadvice:        'info_received',
  in_transit:       'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered:        'delivered',
  incident:         'exception',
};

export class GlsTrackingProvider implements TrackingProvider {
  readonly providerName = 'gls';
  readonly carrierKeys = ['gls'];

  isConfigured(): boolean {
    return Boolean(process.env.GLS_API_KEY);
  }

  async fetchTracking(trackingNumber: string): Promise<TrackingResult> {
    if (!this.isConfigured()) {
      throw new TrackingProviderError(this.providerName, 'auth', 'GLS API Key fehlt');
    }

    const url = `https://api.gls-group.eu/public/v1/shipments/${encodeURIComponent(trackingNumber)}/tracking`;
    const data = await fetchJsonWithTimeout<ProviderApiResponse>(
      url,
      { method: 'GET', headers: { Authorization: `Bearer ${String(process.env.GLS_API_KEY)}` } },
      Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000),
      this.providerName,
    );

    let internalStatus = normalizeCarrierStatus(data.statusCode || data.statusText, GLS_STATUS_MAP);
    const events = dedupeEvents(
      (data.events || []).map((event) => {
        const desc = event.description || event.statusText || 'Status-Update';
        let evStatus = normalizeCarrierStatus(event.statusCode || event.statusText, GLS_STATUS_MAP);
        if (detectPackstationFromDescription(desc)) evStatus = 'in_packstation';
        return { timestamp: new Date(event.timestamp), location: event.location || '', status: internalStatusToDb(evStatus), description: desc };
      }),
    );

    if (detectPackstationFromDescription(data.description || data.statusText || '')) {
      internalStatus = 'in_packstation';
    }

    return { provider: this.providerName, internalStatus, status: internalStatusToDb(internalStatus), events, estimatedDelivery: data.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined };
  }
}
