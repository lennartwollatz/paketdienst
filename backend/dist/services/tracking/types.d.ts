export type InternalTrackingStatus = 'info_received' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
export interface TrackingEvent {
    timestamp: Date;
    location: string;
    status: string;
    description: string;
}
export interface TrackingResult {
    status: string;
    internalStatus: InternalTrackingStatus;
    events: TrackingEvent[];
    estimatedDelivery?: Date;
    provider: string;
}
export type TrackingErrorType = 'auth' | 'rate_limit' | 'not_found' | 'timeout' | 'network' | 'unknown';
export declare class TrackingProviderError extends Error {
    readonly type: TrackingErrorType;
    readonly provider: string;
    readonly retryable: boolean;
    constructor(provider: string, type: TrackingErrorType, message: string, retryable?: boolean);
}
export interface TrackingProvider {
    readonly carrierKeys: string[];
    readonly providerName: string;
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
//# sourceMappingURL=types.d.ts.map