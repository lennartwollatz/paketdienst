export interface ProviderApiEvent {
    timestamp: string;
    location?: string;
    statusCode?: string;
    statusText?: string;
    description?: string;
}
export interface ProviderApiResponse {
    statusCode?: string;
    statusText?: string;
    description?: string;
    estimatedDelivery?: string;
    events?: ProviderApiEvent[];
}
export declare function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number, providerName: string): Promise<T>;
//# sourceMappingURL=types.d.ts.map