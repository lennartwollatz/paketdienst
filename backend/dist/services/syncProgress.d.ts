export type SyncPhase = 'fetch' | 'analyze' | 'tracking' | 'load';
export declare const SYNC_PHASE_WEIGHTS: Record<SyncPhase, number>;
export declare const SYNC_PHASE_LABELS: Record<SyncPhase, string>;
export interface SyncProgressPayload {
    phase: SyncPhase;
    current: number;
    total: number;
    percent: number;
    label: string;
}
export declare function calcSyncPercent(phases: Record<SyncPhase, {
    current: number;
    total: number;
}>): number;
export declare function buildSyncProgress(phase: SyncPhase, current: number, total: number, phases: Record<SyncPhase, {
    current: number;
    total: number;
}>, label?: string): SyncProgressPayload;
//# sourceMappingURL=syncProgress.d.ts.map