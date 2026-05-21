"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNC_PHASE_LABELS = exports.SYNC_PHASE_WEIGHTS = void 0;
exports.calcSyncPercent = calcSyncPercent;
exports.buildSyncProgress = buildSyncProgress;
exports.SYNC_PHASE_WEIGHTS = {
    fetch: 0.1,
    analyze: 0.5,
    tracking: 0.4,
    load: 0.1,
};
exports.SYNC_PHASE_LABELS = {
    fetch: 'E-Mails werden abgerufen',
    analyze: 'E-Mails werden mit KI verarbeitet',
    tracking: 'Sendungsstatus werden abgerufen',
    load: 'Bestellungen werden geladen',
};
function phaseRatio(current, total) {
    if (total <= 0)
        return 1;
    return Math.min(1, Math.max(0, current / total));
}
function calcSyncPercent(phases) {
    let sum = 0;
    for (const phase of Object.keys(exports.SYNC_PHASE_WEIGHTS)) {
        sum += exports.SYNC_PHASE_WEIGHTS[phase] * phaseRatio(phases[phase].current, phases[phase].total);
    }
    return Math.min(100, Math.round(sum * 100));
}
function buildSyncProgress(phase, current, total, phases, label) {
    const safeTotal = Math.max(total, 1);
    const detail = total > 0 ? ` (${Math.min(current, safeTotal)}/${total})` : '';
    return {
        phase,
        current,
        total,
        percent: calcSyncPercent(phases),
        label: label ?? `${exports.SYNC_PHASE_LABELS[phase]}${detail}`,
    };
}
//# sourceMappingURL=syncProgress.js.map