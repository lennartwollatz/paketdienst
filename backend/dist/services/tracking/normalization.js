"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERNAL_STATUS_TO_DB = void 0;
exports.normalizeCarrierStatus = normalizeCarrierStatus;
exports.internalStatusToDb = internalStatusToDb;
exports.detectPackstationFromDescription = detectPackstationFromDescription;
exports.dedupeEvents = dedupeEvents;
/**
 * Mapping von InternalTrackingStatus → Wert der in Order.status gespeichert wird.
 * Muss mit den Schlüsseln in StatusBadge.tsx (Frontend) übereinstimmen.
 */
exports.INTERNAL_STATUS_TO_DB = {
    info_received: 'processing',
    in_transit: 'in transit',
    out_for_delivery: 'in transit', // "Im Versand" – kein eigener Status mehr
    in_packstation: 'in packstation',
    delivered: 'delivered',
    exception: 'in transit',
    unknown: 'unknown',
};
function normalizeCarrierStatus(rawStatus, statusMap) {
    if (!rawStatus)
        return 'unknown';
    const key = rawStatus.trim().toLowerCase();
    return statusMap[key] ?? 'unknown';
}
/** Gibt den DB-Schlüssel zurück (z.B. "in transit", "delivered"). */
function internalStatusToDb(status) {
    return exports.INTERNAL_STATUS_TO_DB[status] ?? 'unknown';
}
/**
 * Erkennt anhand von Keywords in der Beschreibung, ob es sich um
 * einen Packstation-Event handelt.
 */
function detectPackstationFromDescription(description) {
    return /packstation|paketstation|parcel\s*locker|abholstation|locker/i.test(description);
}
function dedupeEvents(events) {
    const seen = new Set();
    return events.filter((event) => {
        const key = `${event.timestamp.toISOString()}::${event.status}::${event.location || ''}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=normalization.js.map