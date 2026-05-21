import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import toast from 'react-hot-toast';
import type { SyncPhase, SyncProgressEvent } from '../api/emailAccounts';
import { syncAccountWithProgress } from '../lib/syncProgress';
import { buildLoadProgress, calcSyncPercent } from '../lib/syncPercent';

type PhaseState = Record<SyncPhase, { current: number; total: number }>;

function emptyPhaseState(): PhaseState {
  return {
    fetch:    { current: 0, total: 0 },
    analyze:  { current: 0, total: 0 },
    tracking: { current: 0, total: 0 },
    load:     { current: 0, total: 0 },
  };
}

interface SyncStore {
  syncingAccountId: string | null;
  progress: SyncProgressEvent | null;
  startSync: (accountId: string, onSynced?: () => void | Promise<void>) => Promise<void>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  syncingAccountId: null,
  progress: null,

  startSync: async (accountId, onSynced) => {
    const { syncingAccountId } = get();
    if (syncingAccountId === accountId) return;
    if (syncingAccountId) {
      toast.error('Es läuft bereits ein Sync für ein anderes Konto.');
      return;
    }

    const phaseState = emptyPhaseState();

    set({
      syncingAccountId: accountId,
      progress: {
        phase: 'fetch',
        current: 0,
        total: 1,
        percent: 0,
        label: 'Synchronisation wird gestartet…',
      },
    });

    try {
      await syncAccountWithProgress(accountId, {
        onProgress: (event) => {
          if (get().syncingAccountId !== accountId) return;
          phaseState[event.phase] = { current: event.current, total: event.total };
          set({
            progress: {
              ...event,
              percent: calcSyncPercent(phaseState),
            },
          });
        },
        onComplete: async (result) => {
          if (get().syncingAccountId !== accountId) return;

          const loading = buildLoadProgress(phaseState, 0, 1);
          set({
            progress: {
              phase: 'load',
              current: 0,
              total: 1,
              percent: loading.percent,
              label: 'Bestellungen werden geladen…',
            },
          });

          await onSynced?.();

          const done = buildLoadProgress(phaseState, 1, 1);
          set({
            progress: {
              phase: 'load',
              current: 1,
              total: 1,
              percent: done.percent,
              label: 'Fertig',
            },
          });
          toast.success(result.message);
        },
        onError: (message) => {
          toast.error(message);
        },
      });
    } catch {
      toast.error('Sync fehlgeschlagen');
    } finally {
      if (get().syncingAccountId === accountId) {
        set({ syncingAccountId: null, progress: null });
      }
    }
  },
}));

export function useAccountSyncState(accountId: string) {
  return useSyncStore(
    useShallow((s) => ({
      isSyncing: s.syncingAccountId === accountId,
      isAnySyncRunning: s.syncingAccountId !== null,
      progress: s.syncingAccountId === accountId ? s.progress : null,
      startSync: s.startSync,
    })),
  );
}
