export type InternalTrackingStatus =
  | 'info_received'
  | 'in_transit'
  | 'out_for_delivery'
  | 'in_packstation'
  | 'delivered'
  | 'exception'
  | 'unknown';

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

export type TrackingErrorType =
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'timeout'
  | 'network'
  | 'unknown';

export class TrackingProviderError extends Error {
  public readonly type: TrackingErrorType;
  public readonly provider: string;
  public readonly retryable: boolean;

  constructor(provider: string, type: TrackingErrorType, message: string, retryable = false) {
    super(message);
    this.provider = provider;
    this.type = type;
    this.retryable = retryable;
  }
}

/** HTTP-Status für API-Antworten – not_found vom Provider ist kein „Route not found“. */
export function trackingErrorStatusCode(type: TrackingErrorType): number {
  switch (type) {
    case 'rate_limit': return 429;
    case 'auth':       return 502;
    case 'not_found':  return 502;
    case 'timeout':
    case 'network':
    case 'unknown':
    default:           return 503;
  }
}

export interface TrackingProvider {
  readonly carrierKeys: string[];
  readonly providerName: string;
  isConfigured(): boolean;
  fetchTracking(trackingNumber: string, carrier?: string): Promise<TrackingResult>;
}
