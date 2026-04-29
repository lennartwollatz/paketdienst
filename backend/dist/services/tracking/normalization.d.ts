import { InternalTrackingStatus } from './types';
export declare const INTERNAL_STATUS_LABELS: Record<InternalTrackingStatus, string>;
export declare function normalizeCarrierStatus(rawStatus: string | undefined, statusMap: Record<string, InternalTrackingStatus>): InternalTrackingStatus;
export declare function internalStatusToLabel(status: InternalTrackingStatus): string;
export declare function dedupeEvents<T extends {
    timestamp: Date;
    status: string;
    location: string;
}>(events: T[]): T[];
//# sourceMappingURL=normalization.d.ts.map