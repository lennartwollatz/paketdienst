/**
 * TrackingMore – universeller Tracking-Provider via offizielles Node.js SDK
 *
 * SDK:  https://github.com/TrackingMore-API/trackingmore-sdk-nodejs
 * API:  https://api.trackingmore.com/v4
 * Auth: Header "Tracking-Api-Key: <key>"
 *
 * Ablauf:
 *  1. Carrier-Code ermitteln:
 *     a) Aus internem Mapping (kein API-Aufruf nötig)
 *     b) Fallback: couriers/detect API
 *  2. createTracking – registriert die Sendungsnummer (4101 = bereits bekannt, wird ignoriert)
 *  3. GET /v4/trackings/get – aktueller Status + Checkpoints
 */
import { TrackingProvider, TrackingResult } from '../types';
export declare class TrackingMoreProvider implements TrackingProvider {
    readonly providerName = "trackingmore";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string, carrier?: string): Promise<TrackingResult>;
}
//# sourceMappingURL=trackingmore.d.ts.map