import api from './client';

export interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  imapHost: string;
  imapPort: number;
  username: string;
  lastSyncAt: string | null;
  createdAt: string;
  blockedFolders?: string[];
}

export interface FolderInfo {
  path: string;
  name: string;
  isBlocked: boolean;
}

export interface AddEmailAccountData {
  provider: string;
  email: string;
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
}

export interface ProviderDefaults {
  [key: string]: { host: string; port: number };
}

export type SyncPhase = 'fetch' | 'analyze' | 'tracking' | 'load';

export interface SyncProgressEvent {
  phase: SyncPhase;
  current: number;
  total: number;
  percent: number;
  label: string;
}

export interface SyncCompleteResult {
  type: 'complete';
  message: string;
  processed: number;
  newOrders: number;
  mergedOrders: number;
}

export const emailAccountsApi = {
  getAll: () => api.get<EmailAccount[]>('/email-accounts'),

  getProviders: () => api.get<ProviderDefaults>('/email-accounts/providers'),

  add: (data: AddEmailAccountData) =>
    api.post<EmailAccount>('/email-accounts', data),

  delete: (id: string) => api.delete(`/email-accounts/${id}`),

  sync: (id: string) =>
    api.post<{ message: string; processed: number; newOrders: number }>(
      `/email-accounts/${id}/sync`
    ),

  syncAll: () =>
    api.post<{
      results: {
        accountId: string;
        email: string;
        newOrders?: number;
        mergedOrders?: number;
        error?: string;
      }[];
    }>('/email-accounts/sync-all'),

  getFolders: (id: string) =>
    api.get<{ folders: FolderInfo[]; blockedFolders: string[] }>(`/email-accounts/${id}/folders`),

  updateBlockedFolders: (id: string, blockedFolders: string[]) =>
    api.patch<{ success: boolean; blockedFolders: string[] }>(`/email-accounts/${id}`, { blockedFolders }),
};
