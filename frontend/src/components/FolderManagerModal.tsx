import { useEffect, useState } from 'react';
import { X, FolderOpen, FolderX, Loader2, Shield, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { emailAccountsApi, FolderInfo } from '../api/emailAccounts';

interface FolderManagerModalProps {
  accountId: string;
  accountEmail: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function FolderManagerModal({
  accountId,
  accountEmail,
  onClose,
  onSaved,
}: FolderManagerModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await emailAccountsApi.getFolders(accountId);
        setFolders(data.folders);
        setBlocked(new Set(data.blockedFolders));
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Ordner konnten nicht geladen werden';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accountId]);

  const toggleFolder = (path: string) => {
    setBlocked(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await emailAccountsApi.updateBlockedFolders(accountId, Array.from(blocked));
      toast.success('Ordnereinstellungen gespeichert');
      onSaved();
      onClose();
    } catch {
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Ordner verwalten</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{accountEmail}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hint */}
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700">
            <Shield className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Gesperrte Ordner werden beim Synchronisieren <strong>niemals</strong> ausgelesen.
          </p>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Ordner werden geladen…</span>
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && folders.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Keine Ordner gefunden
            </div>
          )}

          {!loading && !error && folders.map(folder => {
            const isBlocked = blocked.has(folder.path);
            return (
              <button
                key={folder.path}
                onClick={() => toggleFolder(folder.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isBlocked
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-gray-50 border border-gray-200 text-gray-800 hover:bg-blue-50 hover:border-blue-200'
                }`}
              >
                {isBlocked ? (
                  <FolderX className="w-4 h-4 flex-shrink-0 text-red-500" />
                ) : (
                  <FolderOpen className="w-4 h-4 flex-shrink-0 text-blue-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{folder.name}</p>
                  {folder.name !== folder.path && (
                    <p className="text-xs text-gray-400 truncate">{folder.path}</p>
                  )}
                </div>
                {isBlocked ? (
                  <span className="flex items-center gap-1 text-xs text-red-500 font-medium flex-shrink-0">
                    <ShieldOff className="w-3.5 h-3.5" />
                    Gesperrt
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 flex-shrink-0">Aktiv</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
