import { TrackingProvider, TrackingResult } from '../types';
export declare class DpdTrackingProvider implements TrackingProvider {
    readonly providerName = "dpd";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
//# sourceMappingURL=dpd.d.ts.map