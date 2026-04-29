import { TrackingProvider, TrackingResult } from '../types';
export declare class HermesTrackingProvider implements TrackingProvider {
    readonly providerName = "hermes";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
//# sourceMappingURL=hermes.d.ts.map