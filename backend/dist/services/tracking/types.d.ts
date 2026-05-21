export type InternalTrackingStatus = 'info_received' | 'in_transit' | 'out_for_delivery' | 'in_packstation' | 'delivered' | 'exception' | 'unknown';
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
    /** Von TrackingMore erkannter Carrier-Name (couriers/detect) */
    detectedCarrier?: string;
    /** TrackingMore courier_code */
    courierCode?: string;
}
export type TrackingErrorType = 'auth' | 'rate_limit' | 'not_found' | 'timeout' | 'network' | 'unknown';
export declare class TrackingProviderError extends Error {
    readonly type: TrackingErrorType;
    readonly provider: string;
    readonly retryable: boolean;
    constructor(provider: string, type: TrackingErrorType, message: string, retryable?: boolean);
}
/** HTTP-Status für API-Antworten – not_found vom Provider ist kein „Route not found“. */
export declare function trackingErrorStatusCode(type: TrackingErrorType): number;
export interface TrackingProvider {
    readonly carrierKeys: string[];
    readonly providerName: string;
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string, carrier?: string): Promise<TrackingResult>;
}
//# sourceMappingURL=types.d.ts.map