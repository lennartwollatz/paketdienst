import { useState } from 'react';
import { X, LogOut, Key, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

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
