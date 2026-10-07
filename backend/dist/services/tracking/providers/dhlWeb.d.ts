import { TrackingProvider, TrackingResult } from '../types';
interface DhlWebEvent {
    datum?: string;
    status?: string;
    ort?: string;
    location?: string;
}
interface DhlWebSendungsverlauf {
    kurzStatus?: string;
    events?: DhlWebEvent[];
}
interface DhlWebSendung {
    id?: string;
    hasCompleteDetails?: boolean;
    sendungsdetails?: {
        sendungsverlauf?: DhlWebSendungsverlauf;
        zustellung?: {
            zustelldatum?: string;
        };
    };
}
interface DhlWebSearchResponse {
    sendungen?: DhlWebSendung[];
}
export interface ExtractedDhlSendungsverlauf {
    text: string;
    events: Array<{
        timestamp: Date;
        location: string;
        description: string;
    }>;
    kurzStatus?: string;
}
export interface DhlWebFetchResult {
    pageUrl: string;
    dataPath: string;
    rawData: DhlWebSearchResponse;
}
export declare function buildDhlTrackingPageUrl(trackingNumber: string): string;
/**
 * Liest den Datenpfad aus dem HTML der DHL-Sendungsverfolgungsseite.
 * Die Webseite bindet ein React-Widget ein, das seine Daten von dort lädt.
 */
export declare function extractDataPathFromHtml(html: string): string;
/**
 * Extrahiert den Detaillierten Sendungsverlauf aus den Webdaten.
 */
export declare function extractSendungsverlauf(data: DhlWebSearchResponse): ExtractedDhlSendungsverlauf | null;
/**
 * Ruft die DHL-Sendungsverfolgungswebseite auf und lädt die zugehörigen Tracking-Daten,
 * die die Seite clientseitig nachlädt.
 */
export declare function fetchDhlTrackingFromWeb(trackingNumber: string): Promise<DhlWebFetchResult>;
/**
 * DHL-Web-Tracking:
 * 1. Webseite mit Sendungsnummer abrufen
 * 2. Sendungsverlauf programmatisch extrahieren
 * 3. Extrahierte Informationen an ChatGPT senden, um den Status zu ermitteln
 */
export declare class DhlWebTrackingProvider implements TrackingProvider {
    readonly providerName = "dhl-web";
    readonly carrierKeys: string[];
    isConfigured(): boolean;
    fetchTracking(trackingNumber: string): Promise<TrackingResult>;
}
export {};
//# sourceMappingURL=dhlWeb.d.ts.map