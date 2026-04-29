"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchJsonWithTimeout = fetchJsonWithTimeout;
const types_1 = require("../types");
async function fetchJsonWithTimeout(url, init, timeoutMs, providerName) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
            throw new types_1.TrackingProviderError(providerName, 'auth', 'Authentifizierung fehlgeschlagen');
        }
        if (response.status === 404) {
            throw new types_1.TrackingProviderError(providerName, 'not_found', 'Sendung nicht gefunden');
        }
        if (response.status === 429) {
            throw new types_1.TrackingProviderError(providerName, 'rate_limit', 'Rate Limit erreicht', true);
        }
        if (!response.ok) {
            throw new types_1.TrackingProviderError(providerName, 'network', `Carrier API Fehler: HTTP ${response.status}`, response.status >= 500);
        }
        return (await response.json());
    }
    catch (error) {
        if (error instanceof types_1.TrackingProviderError)
            throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new types_1.TrackingProviderError(providerName, 'timeout', 'Carrier API Timeout', true);
        }
        throw new types_1.TrackingProviderError(providerName, 'unknown', 'Unbekannter Carrier API Fehler', true);
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=types.js.map