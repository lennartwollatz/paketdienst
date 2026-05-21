import { fetchEmails } from './imap';
import { SyncProgressPayload } from './syncProgress';
type EmailRecord = Awaited<ReturnType<typeof fetchEmails>>[number];
export interface AccountSyncResult {
    processed: number;
    newOrders: number;
    mergedOrders: number;
    message: string;
}
type ProgressCallback = (event: SyncProgressPayload) => void;
export interface AccountSyncDeps {
    decryptPassword: (encrypted: string) => string;
    getUnprocessedEmails: (emails: EmailRecord[], userId: string, accountId: string) => Promise<{
        email: EmailRecord;
        rawEmailId: string;
    }[]>;
    applyOrderInfo: (email: EmailRecord, rawEmailId: string, orderInfo: import('./openai').OrderInfo, userId: string, accountId: string) => Promise<'new' | 'merged' | 'skipped'>;
}
export declare function runAccountSyncWithProgress(deps: AccountSyncDeps, accountId: string, userId: string, options: {
    fullResync?: boolean;
}, onProgress: ProgressCallback): Promise<AccountSyncResult>;
export {};
//# sourceMappingURL=accountSync.d.ts.map