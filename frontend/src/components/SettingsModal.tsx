import { useEffect, useState } from 'react';
import { X, LogOut, Key, ChevronRight, Bell, BellOff, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { pushApi } from '../api/push';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import {
  getPushStatus,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from '../lib/push';

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

export default function SettingsModal({ onClose, onLogout }: Props) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [loading, setLoading] = useState(false);

  const [pushStatus, setPushStatus] = useState<PushStatus>({
    supported: isPushSupported(),
    permission: 'default',
    subscribed: false,
  });
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getPushStatus();
      if (!cancelled) setPushStatus(status);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNew) {
      toast.error('Neue Passwörter stimmen nicht überein');
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Passwort erfolgreich geändert');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNew('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Fehler beim Ändern';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    try {
      await subscribeToPush();
      const status = await getPushStatus();
      setPushStatus(status);
      toast.success('Benachrichtigungen aktiviert');
    } catch (err) {
      const msg = (err as Error).message || 'Aktivierung fehlgeschlagen';
      toast.error(msg);
      const status = await getPushStatus();
      setPushStatus(status);
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    try {
      await unsubscribeFromPush();
      const status = await getPushStatus();
      setPushStatus(status);
      toast.success('Benachrichtigungen deaktiviert');
    } catch (err) {
      toast.error((err as Error).message || 'Deaktivierung fehlgeschlagen');
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setPushBusy(true);
    try {
      const { data } = await pushApi.test();
      if (data.delivered === 0) {
        toast.error('Keine aktive Subscription gefunden.');
      } else {
        toast.success(`Testnachricht an ${data.delivered} Gerät${data.delivered === 1 ? '' : 'e'} gesendet`);
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as Error).message || 'Test fehlgeschlagen';
      toast.error(msg);
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-t-3xl shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Einstellungen</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 pb-8 space-y-4">
          {/* Account Info */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-xs text-gray-400 uppercase font-medium tracking-wide mb-1">Angemeldet als</p>
            <p className="font-semibold text-gray-900">{user?.email}</p>
            {user?.isTestUser && (
              <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                Testzugang
              </span>
            )}
          </div>

          {/* Push-Benachrichtigungen */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                {pushStatus.subscribed
                  ? <Bell className="w-4 h-4 text-blue-600" />
                  : <BellOff className="w-4 h-4 text-gray-500" />}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-800">Benachrichtigungen</p>
                <p className="text-xs text-gray-500">
                  {!pushStatus.supported && 'Dieser Browser unterstützt keine Push-Benachrichtigungen.'}
                  {pushStatus.supported && pushStatus.permission === 'denied' && 'Im Browser blockiert – bitte in den Browser-Einstellungen erlauben.'}
                  {pushStatus.supported && pushStatus.permission !== 'denied' && (
                    pushStatus.subscribed
                      ? 'Aktiv – du wirst bei Statusänderungen informiert.'
                      : 'Werde benachrichtigt, wenn sich der Status einer Bestellung ändert.'
                  )}
                </p>
              </div>
            </div>

            {pushStatus.supported && pushStatus.permission !== 'denied' && (
              <div className="flex gap-2">
                {!pushStatus.subscribed ? (
                  <button
                    onClick={handleEnablePush}
                    disabled={pushBusy}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {pushBusy ? 'Aktiviert...' : 'Aktivieren'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleTestPush}
                      disabled={pushBusy}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-4 h-4" /> Test
                    </button>
                    <button
                      onClick={handleDisablePush}
                      disabled={pushBusy}
                      className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      Deaktivieren
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Change Password */}
          {!showPasswordForm ? (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Key className="w-4 h-4 text-blue-600" />
                </div>
                <span className="font-medium text-gray-800">Passwort ändern</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <h3 className="font-semibold text-gray-800">Passwort ändern</h3>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-field"
                placeholder="Aktuelles Passwort"
                required
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                placeholder="Neues Passwort (min. 8 Zeichen)"
                required
              />
              <input
                type="password"
                value={confirmNew}
                onChange={(e) => setConfirmNew(e.target.value)}
                className="input-field"
                placeholder="Neues Passwort bestätigen"
                required
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPasswordForm(false)} className="btn-secondary">
                  Abbrechen
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Speichert...' : 'Speichern'}
                </button>
              </div>
            </form>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors"
          >
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
            <span className="font-medium">Abmelden</span>
          </button>
        </div>
      </div>
    </div>
  );
}
