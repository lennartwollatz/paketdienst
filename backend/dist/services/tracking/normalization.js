"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERNAL_STATUS_LABELS = void 0;
exports.normalizeCarrierStatus = normalizeCarrierStatus;
exports.internalStatusToLabel = internalStatusToLabel;
exports.dedupeEvents = dedupeEvents;
exports.INTERNAL_STATUS_LABELS = {
    info_received: 'Informationen erhalten',
    in_transit: 'In Transit',
    out_for_delivery: 'Wird zugestellt',
    delivered: 'Zugestellt',
    exception: 'Ausnahme',
    unknown: 'Unbekannt',
};
function normalizeCarrierStatus(rawStatus, statusMap) {
    if (!rawStatus)
        return 'unknown';
    const key = rawStatus.trim().toLowerCase();
    return statusMap[key] ?? 'unknown';
}
function internalStatusToLabel(status) {
    return exports.INTERNAL_STATUS_LABELS[status] ?? exports.INTERNAL_STATUS_LABELS.unknown;
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