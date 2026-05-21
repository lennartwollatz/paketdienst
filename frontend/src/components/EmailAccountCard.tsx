import { useState } from 'react';
import { Mail, Trash2, RefreshCw, CheckCircle, Clock, FolderOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { EmailAccount, emailAccountsApi } from '../api/emailAccounts';
import FolderManagerModal from './FolderManagerModal';
import SyncProgressBar from './SyncProgressBar';
import { useAccountSyncState } from '../store/syncStore';

const PROVIDER_ICONS: Record<string, string> = {
  gmail: '📧',
  outlook: '📨',
  hotmail: '📨',
  yahoo: '📬',
  icloud: '🍎',
  gmx: '📮',
  web_de: '📮',
  freenet: '📬',
};

interface EmailAccountCardProps {
  account: EmailAccount;
  onDelete: (id: string) => void;
  onSynced: () => void | Promise<void>;
}

export default function EmailAccountCard({ account, onDelete, onSynced }: EmailAccountCardProps) {
  const { isSyncing, isAnySyncRunning, progress, startSync } = useAccountSyncState(account.id);
  const [deleting, setDeleting] = useState(false);
  const [showFolderManager, setShowFolderManager] = useState(false);

  const handleSync = () => {
    void startSync(account.id, onSynced);
  };

  const handleFoldersSaved = () => {
    onSynced();
  };

  const handleDelete = async () => {
    if (!confirm(`${account.email} entfernen?`)) return;
    setDeleting(true);
    try {
      await emailAccountsApi.delete(account.id);
      onDelete(account.id);
      toast.success('Konto entfernt');
    } catch {
      toast.error('Fehler beim Entfernen');
      setDeleting(false);
    }
  };

  const icon = PROVIDER_ICONS[account.provider.toLowerCase()] || '📧';

  return (
    <>
    <div className="card">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl">
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 capitalize">{account.provider}</h3>
              <p className="text-sm text-gray-500 truncate">{account.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 mt-1.5">
            {account.lastSyncAt ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs text-gray-400">
                  Zuletzt synchronisiert{' '}
                  {formatDistanceToNow(new Date(account.lastSyncAt), {
                    addSuffix: true,
                    locale: de,
                  })}
                </span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-400">Noch nicht synchronisiert</span>
              </>
            )}
          </div>

          {isSyncing && (
            <SyncProgressBar
              progress={progress ?? {
                phase: 'fetch',
                current: 0,
                total: 1,
                percent: 0,
                label: 'Synchronisation läuft…',
              }}
            />
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSync}
              disabled={isAnySyncRunning}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 active:bg-blue-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Lädt...' : 'Synchronisieren'}
            </button>
            <button
              onClick={() => setShowFolderManager(true)}
              disabled={isAnySyncRunning}
              title="Ordner verwalten – gesperrte Ordner werden nicht synchronisiert"
              className="flex items-center justify-center p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 active:bg-indigo-200 transition-colors disabled:opacity-50"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || isAnySyncRunning}
              className="flex items-center justify-center p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <Mail className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
      </div>
    </div>

    {showFolderManager && (
      <FolderManagerModal
        accountId={account.id}
        accountEmail={account.email}
        onClose={() => setShowFolderManager(false)}
        onSaved={handleFoldersSaved}
      />
    )}
  </>
  );
}
