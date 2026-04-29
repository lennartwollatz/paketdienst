import { TrackingProvider, TrackingResult } from '../types';
export declare class GlsTrackingProvider implements TrackingProvider {
    readonly providerName = "gls";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
//# sourceMappingURL=gls.d.ts.map