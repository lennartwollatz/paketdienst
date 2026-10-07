/**
 * AfterShip – universeller Tracking-Provider via offizielles Node.js SDK
 *
 * SDK:  https://github.com/AfterShip/tracking-sdk-nodejs
 * API:  https://api.aftership.com/tracking/2025-07
 * Auth: Header "as-api-key: <key>"
 *
 * Ablauf:
 *  1. Carrier-Slug ermitteln (couriers/detect)
 *  2. createTracking – registriert die Sendungsnummer (4003 = bereits bekannt, wird ignoriert)
 *  3. getTrackings – aktueller Status + Checkpoints
 */
import { TrackingProvider, TrackingResult } from '../types';
export declare class AfterShipProvider implements TrackingProvider {
    readonly providerName = "aftership";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
/**
 * Entfernt eine Sendung aus dem AfterShip-Konto (DELETE by ID).
 * Lokale Bestellungen und Tracking-Events werden nicht gelöscht.
 * Fehler werden geloggt, werfen aber keine Exception (idempotent).
 */
export declare function deleteTrackingFromAfterShip(trackingNumber: string, options?: {
    courierCode?: string | null;
    carrier?: string | null;
}): Promise<void>;
//# sourceMappingURL=aftership.d.ts.map