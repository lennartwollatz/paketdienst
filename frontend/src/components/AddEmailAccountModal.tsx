import { useState, useEffect } from 'react';
import { X, ChevronDown, AlertCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { emailAccountsApi, AddEmailAccountData, ProviderDefaults } from '../api/emailAccounts';

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail', icon: '📧' },
  { id: 'outlook', label: 'Outlook / Microsoft 365', icon: '📨' },
  { id: 'hotmail', label: 'Hotmail', icon: '📨' },
  { id: 'yahoo', label: 'Yahoo Mail', icon: '📬' },
  { id: 'icloud', label: 'iCloud Mail', icon: '🍎' },
  { id: 'gmx', label: 'GMX', icon: '📮' },
  { id: 'web_de', label: 'Web.de', icon: '📮' },
  { id: 'freenet', label: 'Freenet', icon: '📬' },
  { id: 'custom', label: 'Anderer Anbieter...', icon: '✉️' },
];

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddEmailAccountModal({ onClose, onAdded }: Props) {
  const [provider, setProvider] = useState('');
  const [email, setEmail] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerDefaults, setProviderDefaults] = useState<ProviderDefaults>({});
  const [showCustomHost, setShowCustomHost] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hintMsg, setHintMsg] = useState('');

  useEffect(() => {
    emailAccountsApi.getProviders().then(({ data }) => setProviderDefaults(data)).catch(() => {});
  }, []);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (!username) setUsername(val);
  };

  const handleProviderChange = (p: string) => {
    setProvider(p);
    setErrorMsg('');
    setHintMsg('');
    if (p === 'custom') {
      setShowCustomHost(true);
      setImapHost('');
    } else {
      setShowCustomHost(false);
      const defaults = providerDefaults[p];
      if (defaults) {
        setImapHost(defaults.host);
        setImapPort(defaults.port);
      }
    }
    setUsername('');
    setEmail('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setHintMsg('');
    setLoading(true);

    const data: AddEmailAccountData = {
      provider,
      email,
      imapHost,
      imapPort,
      username,
      password,
    };

    try {
      await emailAccountsApi.add(data);
      toast.success('E-Mail-Konto erfolgreich hinzugefügt!');
      onAdded();
      onClose();
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; hint?: string } } })?.response?.data;
      const msg = resp?.error || 'Fehler beim Hinzufügen';
      const hint = resp?.hint || '';
      setErrorMsg(msg);
      setHintMsg(hint);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold text-gray-900">E-Mail-Konto hinzufügen</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 pb-8">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">E-Mail-Anbieter</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    provider === p.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>{p.icon}</span>
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {provider && (
            <>
              {/* Provider-spezifische Hinweise */}
              {provider === 'gmail' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-amber-800 text-xs font-semibold">Gmail – App-Passwort erstellen:</p>
                  <ol className="text-amber-700 text-xs space-y-1 list-none">
                    <li>1. Öffne die <strong>Google-Einstellungen</strong> deines Geräts</li>
                    <li>2. Tippe in die Suche: <strong>„App Passwort"</strong></li>
                    <li>3. Wähle den Eintrag <em>„App-Passwörter"</em> aus</li>
                    <li>4. Wähle im Dropdown einen Namen (z.&nbsp;B. „Lieferverfolgung") und tippe auf <strong>Erstellen</strong></li>
                    <li>5. Das angezeigte 16-stellige Passwort hier im Feld <em>Passwort</em> eintragen</li>
                  </ol>
                  <p className="text-amber-600 text-xs">Das normale Google-Passwort funktioniert nicht.</p>
                </div>
              )}

              {(provider === 'outlook' || provider === 'hotmail') && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-blue-700 text-xs">
                    <strong>Outlook:</strong> Verwende dein normales Microsoft-Passwort. Falls 2FA aktiv ist, erstelle ein App-Passwort unter account.microsoft.com → Sicherheit → App-Passwörter.
                  </p>
                </div>
              )}

              {(provider === 'web_de' || provider === 'gmx') && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-amber-700 text-xs">
                    <strong>{provider === 'web_de' ? 'WEB.DE' : 'GMX'}:</strong> Externe Programme benötigen ein <strong>App-Passwort</strong>. Bitte aktiviere unter{' '}
                    {provider === 'web_de' ? 'WEB.DE' : 'GMX'} → Einstellungen → Sicherheit →{' '}
                    <em>"Externe Programme (POP3 & IMAP)"</em> und erstelle dort ein App-Passwort. Das normale Konto-Passwort funktioniert nicht.
                  </p>
                </div>
              )}

              {provider === 'yahoo' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-amber-700 text-xs">
                    <strong>Yahoo:</strong> Erstelle ein <strong>App-Passwort</strong> unter Yahoo-Konto → Sicherheit → App-Passwörter generieren. Das normale Yahoo-Passwort funktioniert nicht.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-Mail-Adresse
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className="input-field"
                  placeholder="deine@email.de"
                  required
                />
              </div>

              {showCustomHost && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      IMAP-Server
                    </label>
                    <input
                      type="text"
                      value={imapHost}
                      onChange={(e) => setImapHost(e.target.value)}
                      className="input-field"
                      placeholder="imap.beispiel.de"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Port
                    </label>
                    <input
                      type="number"
                      value={imapPort}
                      onChange={(e) => setImapPort(parseInt(e.target.value))}
                      className="input-field"
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Benutzername (meist E-Mail-Adresse)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field"
                  placeholder="deine@email.de"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Passwort / App-Passwort
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>

              {!showCustomHost && (
                <button
                  type="button"
                  onClick={() => setShowCustomHost(true)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
                >
                  <ChevronDown className="w-4 h-4" />
                  IMAP-Server anpassen ({imapHost}:{imapPort})
                </button>
              )}

              {/* Fehlermeldung */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-red-700 text-sm font-medium">{errorMsg}</p>
                  </div>
                  {hintMsg && (
                    <div className="flex items-start gap-2 mt-1">
                      <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-amber-700 text-xs">{hintMsg}</p>
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className="btn-primary mt-2" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verbindung wird getestet...
                  </span>
                ) : 'Konto hinzufügen'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
