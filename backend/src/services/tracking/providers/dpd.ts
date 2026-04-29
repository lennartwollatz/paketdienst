import { dedupeEvents, detectPackstationFromDescription, internalStatusToDb, normalizeCarrierStatus } from '../normalization';
import { InternalTrackingStatus, TrackingProvider, TrackingProviderError, TrackingResult } from '../types';
import { fetchJsonWithTimeout, ProviderApiResponse } from './types';

const DPD_STATUS_MAP: Record<string, InternalTrackingStatus> = {
  created:          'info_received',
  in_transit:       'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered:        'delivered',
  exception:        'exception',
};

export class DpdTrackingProvider implements TrackingProvider {
  readonly providerName = 'dpd';
  readonly carrierKeys = ['dpd'];

  isConfigured(): boolean {
    return Boolean(process.env.DPD_CLIENT_ID && process.env.DPD_CLIENT_SECRET);
  }

  async fetchTracking(trackingNumber: string): Promise<TrackingResult> {
    if (!this.isConfigured()) {
      throw new TrackingProviderError(this.providerName, 'auth', 'DPD API Zugangsdaten fehlen');
    }

    const url = `https://api.dpd.com/track/v1/shipments/${encodeURIComponent(trackingNumber)}`;
    const data = await fetchJsonWithTimeout<ProviderApiResponse>(
      url,
      { method: 'GET', headers: { 'X-Client-Id': String(process.env.DPD_CLIENT_ID), 'X-Client-Secret': String(process.env.DPD_CLIENT_SECRET) } },
      Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000),
      this.providerName,
    );

    let internalStatus = normalizeCarrierStatus(data.statusCode || data.statusText, DPD_STATUS_MAP);
    const events = dedupeEvents(
      (data.events || []).map((event) => {
        const desc = event.description || event.statusText || 'Status-Update';
        let evStatus = normalizeCarrierStatus(event.statusCode || event.statusText, DPD_STATUS_MAP);
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
