"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackingProviderError = void 0;
exports.trackingErrorStatusCode = trackingErrorStatusCode;
class TrackingProviderError extends Error {
    type;
    provider;
    retryable;
    constructor(provider, type, message, retryable = false) {
        super(message);
        this.provider = provider;
        this.type = type;
        this.retryable = retryable;
    }
}
exports.TrackingProviderError = TrackingProviderError;
/** HTTP-Status für API-Antworten – not_found vom Provider ist kein „Route not found“. */
function trackingErrorStatusCode(type) {
    switch (type) {
        case 'rate_limit': return 429;
        case 'auth': return 502;
        case 'not_found': return 502;
        case 'timeout':
        case 'network':
        case 'unknown':
        default: return 503;
    }
}
//# sourceMappingURL=types.js.map