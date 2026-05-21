import type { SyncPhase } from '../api/emailAccounts';

export const PHASE_WEIGHTS: Record<SyncPhase, number> = {
  fetch:    0.1,
  analyze:  0.5,
  tracking: 0.4,
  load:     0.1,
};

/** Anteil dieses Schritts am gesamten Fortschrittsbalken (0–100). */
export function getPhaseSharePercent(phase: SyncPhase): number {
  return Math.round(PHASE_WEIGHTS[phase] * 100);
}

function phaseRatio(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, current / total));
}

export function calcSyncPercent(
  phases: Record<SyncPhase, { current: number; total: number }>,
): number {
  let sum = 0;
  for (const phase of Object.keys(PHASE_WEIGHTS) as SyncPhase[]) {
    sum += PHASE_WEIGHTS[phase] * phaseRatio(phases[phase].current, phases[phase].total);
  }
  return Math.min(100, Math.round(sum * 100));
}

export function buildLoadProgress(
  phases: Record<SyncPhase, { current: number; total: number }>,
  current: number,
  total: number,
): { percent: number; label: string } {
  phases.load = { current, total };
  return {
    percent: calcSyncPercent(phases),
    label: `Bestellungen werden geladen (${current}/${total})`,
  };
}
