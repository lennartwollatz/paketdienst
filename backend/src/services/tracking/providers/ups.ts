import { dedupeEvents, detectPackstationFromDescription, internalStatusToDb, normalizeCarrierStatus } from '../normalization';
import { InternalTrackingStatus, TrackingProvider, TrackingProviderError, TrackingResult } from '../types';
import { fetchJsonWithTimeout, ProviderApiResponse } from './types';

const UPS_STATUS_MAP: Record<string, InternalTrackingStatus> = {
  label_created:    'info_received',
  in_transit:       'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered:        'delivered',
  exception:        'exception',
};

export class UpsTrackingProvider implements TrackingProvider {
  readonly providerName = 'ups';
  readonly carrierKeys = ['ups', 'united parcel service'];

  isConfigured(): boolean {
    return Boolean(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET);
  }

  async fetchTracking(trackingNumber: string): Promise<TrackingResult> {
    if (!this.isConfigured()) {
      throw new TrackingProviderError(this.providerName, 'auth', 'UPS OAuth Zugangsdaten fehlen');
    }

    const url = `https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(trackingNumber)}`;
    const data = await fetchJsonWithTimeout<ProviderApiResponse>(
      url,
      { method: 'GET', headers: { 'X-UPS-Client-Id': String(process.env.UPS_CLIENT_ID), 'X-UPS-Client-Secret': String(process.env.UPS_CLIENT_SECRET) } },
      Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000),
      this.providerName,
    );

    let internalStatus = normalizeCarrierStatus(data.statusCode || data.statusText, UPS_STATUS_MAP);
    const events = dedupeEvents(
      (data.events || []).map((event) => {
        const desc = event.description || event.statusText || 'Status-Update';
        let evStatus = normalizeCarrierStatus(event.statusCode || event.statusText, UPS_STATUS_MAP);
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
