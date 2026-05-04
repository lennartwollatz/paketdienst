import { InternalTrackingStatus } from './types';
/**
 * Mapping von InternalTrackingStatus → Wert der in Order.status gespeichert wird.
 * Muss mit den Schlüsseln in StatusBadge.tsx (Frontend) übereinstimmen.
 */
export declare const INTERNAL_STATUS_TO_DB: Record<InternalTrackingStatus, string>;
export declare function normalizeCarrierStatus(rawStatus: string | undefined, statusMap: Record<string, InternalTrackingStatus>): InternalTrackingStatus;
/** Gibt den DB-Schlüssel zurück (z.B. "in transit", "delivered"). */
export declare function internalStatusToDb(status: InternalTrackingStatus): string;
/**
 * Erkennt anhand von Keywords in der Beschreibung, ob es sich um
 * einen Packstation-Event handelt.
 */
export declare function detectPackstationFromDescription(description: string): boolean;
export declare function dedupeEvents<T extends {
    timestamp: Date;
    status: string;
    location: string;
}>(events: T[]): T[];
//# sourceMappingURL=normalization.d.ts.map