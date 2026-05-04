/**
 * Initialisiert web-push mit VAPID-Keys aus der Umgebung.
 * Liefert false zurück, wenn keine Keys gesetzt sind – Push-Versand wird dann übersprungen.
 */
export declare function initPushService(): boolean;
export declare function isPushConfigured(): boolean;
export declare function getVapidPublicKey(): string | null;
export interface PushPayload {
    title: string;
    body: string;
    /** Optionaler Pfad innerhalb der App, wohin der Klick navigieren soll (z. B. /orders/abc) */
    url?: string;
    /** Optionales Tag, damit gleichartige Benachrichtigungen einander ersetzen */
    tag?: string;
    /** Optionale Daten, die an den Service Worker durchgereicht werden */
    data?: Record<string, unknown>;
}
/**
 * Sendet einen Push an alle registrierten Endpoints eines Nutzers.
 * Abgelaufene Subscriptions (404/410) werden automatisch entfernt.
 */
export declare function sendPushToUser(userId: string, payload: PushPayload): Promise<number>;
//# sourceMappingURL=push.d.ts.map