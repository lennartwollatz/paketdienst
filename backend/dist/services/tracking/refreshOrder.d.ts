/** Status, bei denen Tracking im Hintergrund weiter abgefragt wird */
export declare const ACTIVE_TRACKING_STATUSES: readonly ["processing", "in transit", "in packstation", "unknown"];
/** Menschlich lesbarer Text für einen Bestellstatus */
export declare function statusLabel(status: string): string;
/**
 * Aktualisiert Tracking-Daten einer Bestellung und sendet optional eine Push-Benachrichtigung
 * bei Statusänderung.
 */
export declare function refreshOrderTracking(orderId: string, options?: {
    sendPush?: boolean;
}): Promise<boolean>;
/** Tracking im Hintergrund starten (Fehler werden geloggt, Sync blockiert nicht). */
export declare function scheduleOrderTrackingRefresh(orderId: string, options?: {
    sendPush?: boolean;
}): void;
//# sourceMappingURL=refreshOrder.d.ts.map