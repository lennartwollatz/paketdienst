import { InternalTrackingStatus } from './types';
export interface DhlStatusAnalysisResult {
    internalStatus: InternalTrackingStatus;
    status: string;
    reasoning?: string;
}
/** Regelbasierter Fallback, wenn OpenAI nicht verfügbar ist. */
export declare function analyzeDhlStatusFallback(sendungsverlaufText: string): DhlStatusAnalysisResult;
/**
 * Sendet den programmatisch extrahierten Sendungsverlauf an ChatGPT,
 * um den aktuellen Lieferstatus zu ermitteln.
 */
export declare function analyzeDhlTrackingStatus(sendungsverlaufText: string): Promise<DhlStatusAnalysisResult>;
//# sourceMappingURL=dhlStatusAnalysis.d.ts.map