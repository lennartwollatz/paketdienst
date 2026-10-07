import { TrackingResult } from './types';
/**
 * Sendungsverfolgung:
 * - DHL: Webseiten-Abruf (dhl.de) + KI-Statusanalyse, optional TrackingMore als Fallback
 * - Andere Carrier: TrackingMore
 */
export declare function fetchTrackingFromProvider(trackingNumber: string, carrier?: string): Promise<TrackingResult>;
export declare function isLegacyFallbackEnabled(): boolean;
//# sourceMappingURL=orchestrator.d.ts.map