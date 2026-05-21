import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getPushStatus, isPushSupported, subscribeToPush, type PushStatus } from '../lib/push';

const DISMISS_KEY = 'push-prompt-dismissed';

export default function PushPromptBanner() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported() || dismissed) return;
    getPushStatus().then(setStatus).catch(() => undefined);
  }, [dismissed]);

  if (!status?.supported || status.subscribed || status.permission === 'denied' || dismissed) {
    return null;
  }

  const handleEnable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      const next = await getPushStatus();
      setStatus(next);
      toast.success('Benachrichtigungen aktiviert');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="mb-3 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
      <Bell className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-blue-900">Status-Updates per Push</p>
        <p className="mt-0.5 text-xs text-blue-700">
          Erhalte eine Benachrichtigung, sobald sich der Versandstatus einer Bestellung ändert.
        </p>
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? 'Wird aktiviert…' : 'Aktivieren'}
        </button>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded-lg p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600"
        aria-label="Hinweis schließen"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
