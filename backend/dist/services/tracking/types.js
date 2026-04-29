"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackingProviderError = void 0;
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
//# sourceMappingURL=types.js.map