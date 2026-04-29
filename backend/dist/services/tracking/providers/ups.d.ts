import { TrackingProvider, TrackingResult } from '../types';
export declare class UpsTrackingProvider implements TrackingProvider {
    readonly providerName = "ups";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
//# sourceMappingURL=ups.d.ts.map