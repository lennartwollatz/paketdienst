export type SyncPhase = 'fetch' | 'analyze' | 'tracking' | 'load';

export const SYNC_PHASE_WEIGHTS: Record<SyncPhase, number> = {
  fetch:    0.1,
  analyze:  0.5,
  tracking: 0.4,
  load:     0.1,
};

export const SYNC_PHASE_LABELS: Record<SyncPhase, string> = {
  fetch:    'E-Mails werden abgerufen',
  analyze:  'E-Mails werden mit KI verarbeitet',
  tracking: 'Sendungsstatus werden abgerufen',
  load:     'Bestellungen werden geladen',
};

export interface SyncProgressPayload {
  phase: SyncPhase;
  current: number;
  total: number;
  percent: number;
  label: string;
}

function phaseRatio(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, current / total));
}

export function calcSyncPercent(
  phases: Record<SyncPhase, { current: number; total: number }>,
): number {
  let sum = 0;
  for (const phase of Object.keys(SYNC_PHASE_WEIGHTS) as SyncPhase[]) {
    sum += SYNC_PHASE_WEIGHTS[phase] * phaseRatio(phases[phase].current, phases[phase].total);
  }
  return Math.min(100, Math.round(sum * 100));
}

export function buildSyncProgress(
  phase: SyncPhase,
  current: number,
  total: number,
  phases: Record<SyncPhase, { current: number; total: number }>,
  label?: string,
): SyncProgressPayload {
  const safeTotal = Math.max(total, 1);
  const detail =
    total > 0 ? ` (${Math.min(current, safeTotal)}/${total})` : '';
  return {
    phase,
    current,
    total,
    percent: calcSyncPercent(phases),
    label: label ?? `${SYNC_PHASE_LABELS[phase]}${detail}`,
  };
}
