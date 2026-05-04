import { TrackingProvider, TrackingResult } from '../types';
export declare class DhlTrackingProvider implements TrackingProvider {
    readonly providerName = "dhl";
    readonly carrierKeys: string[];
    private get mode();
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
    private fetchUnified;
    private fetchExpress;
}
//# sourceMappingURL=dhl.d.ts.map