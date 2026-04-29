import { TrackingProvider, TrackingResult } from '../types';
export declare class DhlTrackingProvider implements TrackingProvider {
    readonly providerName = "dhl";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
//# sourceMappingURL=dhl.d.ts.map