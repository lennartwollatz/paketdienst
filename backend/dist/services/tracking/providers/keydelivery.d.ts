/**
 * KeyDelivery – universeller Tracking-Provider
 *
 * API:  https://www.kd100.com/docs/getting-started
 * Auth: Header API-Key + signature (MD5(JSON+API-Key+Secret), 32 Zeichen, Großbuchstaben)
 *
 * Ablauf:
 *  1. Carrier-Code ermitteln (carriers/detect oder internes Mapping)
 *  2. POST /api/v1/tracking/realtime – aktueller Status + Events
 */
import { TrackingProvider, TrackingResult } from '../types';
export declare class KeyDeliveryProvider implements TrackingProvider {
    readonly providerName = "keydelivery";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string, carrier?: string): Promise<TrackingResult>;
}
/**
 * KeyDelivery bietet keine Delete-Tracking-API; Sendungen enden automatisch nach Zustellung.
 * Diese Funktion bleibt als No-Op für bestehende Aufrufstellen erhalten.
 */
export declare function deleteTrackingFromKeyDelivery(trackingNumber: string, _options?: {
    courierCode?: string | null;
    carrier?: string | null;
}): Promise<void>;
//# sourceMappingURL=keydelivery.d.ts.map