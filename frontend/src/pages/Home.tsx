import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, Package, Inbox, Store, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { emailAccountsApi, EmailAccount } from '../api/emailAccounts';
import { ordersApi } from '../api/orders';
import { Order } from '../api/orders';
import BottomNav from '../components/BottomNav';
import EmailAccountCard from '../components/EmailAccountCard';
import OrderCard from '../components/OrderCard';
import DeliveryScheduleView from '../components/DeliveryScheduleView';
import AddEmailAccountModal from '../components/AddEmailAccountModal';
import SettingsModal from '../components/SettingsModal';
import PushPromptBanner from '../components/PushPromptBanner';

export default function Home() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'emails' | 'orders'>('orders');
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const loadEmailAccounts = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingEmails(true);
    try {
      const { data } = await emailAccountsApi.getAll();
      setEmailAccounts(data);
    } catch {
      // silent
    } finally {
      if (!options?.silent) setLoadingEmails(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const { data } = await ordersApi.getAll();
      setOrders(data);
    } catch {
      // silent
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    loadEmailAccounts();
    loadOrders();
  }, [loadEmailAccounts, loadOrders]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'emails' || tab === 'orders') {
      setActiveTab(tab);
    }
    if (searchParams.get('settings') === '1') {
      setShowSettings(true);
    }
  }, [searchParams]);

  const handleNavTab = (tab: 'emails' | 'orders' | 'analytics') => {
    if (tab === 'analytics') {
      navigate('/analytics');
      return;
    }
    setActiveTab(tab);
    setShowSettings(false);
    setSearchParams(tab === 'orders' ? { tab: 'orders' } : { tab: 'emails' }, { replace: true });
  };

  const handleSyncAll = async () => {
    if (emailAccounts.length === 0) {
      toast('Füge zuerst ein E-Mail-Konto hinzu', { icon: '📧' });
      setActiveTab('emails');
      return;
    }
    setSyncingAll(true);
    try {
      const { data } = await emailAccountsApi.syncAll();
      const total = data.results.reduce((sum, r) => sum + (r.newOrders || 0), 0);
      const merged = data.results.reduce((sum, r) => sum + (r.mergedOrders || 0), 0);
      const parts = [];
      if (total > 0) parts.push(`${total} neue Bestellung${total !== 1 ? 'en' : ''}`);
      if (merged > 0) parts.push(`${merged} zusammengeführt`);
      toast.success(parts.length > 0 ? parts.join(', ') : 'Keine neuen Bestellungen');
      await loadOrders();
      await loadEmailAccounts();
    } catch {
      toast.error('Sync fehlgeschlagen');
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Tab Content – beide Tabs bleiben gemountet, damit laufende Syncs sichtbar bleiben */}
      <div className={activeTab === 'emails' ? undefined : 'hidden'}>
        <EmailsTab
          accounts={emailAccounts}
          loading={loadingEmails}
          onAdd={() => setShowAddEmail(true)}
          onDelete={(id) => setEmailAccounts((prev) => prev.filter((a) => a.id !== id))}
          onSynced={async () => {
            const syncActive = useSyncStore.getState().syncingAccountId !== null;
            await Promise.all([
              loadOrders(),
              loadEmailAccounts({ silent: syncActive }),
            ]);
          }}
        />
      </div>
      <div className={activeTab === 'orders' ? undefined : 'hidden'}>
        <OrdersTab
          orders={orders}
          loading={loadingOrders}
          onRefresh={loadOrders}
          onAddEmail={() => setActiveTab('emails')}
        />
      </div>

      {/* Bottom Nav */}
      <BottomNav
        activeTab={showSettings ? 'settings' : activeTab}
        onTabChange={handleNavTab}
        onSettings={() => {
          setShowSettings(true);
          setSearchParams({ settings: '1' }, { replace: true });
        }}
        showSettings={showSettings}
      />

      {/* Modals */}
      {showAddEmail && (
        <AddEmailAccountModal
          onClose={() => setShowAddEmail(false)}
          onAdded={loadEmailAccounts}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => {
            setShowSettings(false);
            setSearchParams({}, { replace: true });
          }}
          onLogout={logout}
        />
      )}
    </div>
  );
}

// Emails Tab
function EmailsTab({
  accounts,
  loading,
  onAdd,
  onDelete,
  onSynced,
}: {
  accounts: EmailAccount[];
  loading: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onSynced: () => void;
}) {
  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-800">Verbundene Konten</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 py-2 px-4 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Hinzufügen
        </button>
      </div>

      {loading && accounts.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Kein E-Mail-Konto</h3>
          <p className="text-gray-400 text-sm mb-6">
            Verbinde dein E-Mail-Konto, um Bestellungen automatisch zu erkennen.
          </p>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 py-3 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Konto hinzufügen
          </button>
        </div>
      ) : (
        accounts.map((account) => (
          <EmailAccountCard
            key={account.id}
            account={account}
            onDelete={onDelete}
            onSynced={onSynced}
          />
        ))
      )}
    </div>
  );
}

const STATUS_FILTERS: { value: string; label: string; color: string }[] = [
  { value: 'all',             label: 'Alle',            color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'processing',      label: 'In Bearbeitung',  color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'in transit',      label: 'Im Versand',      color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'in packstation',  label: 'In Packstation',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'delivered',       label: 'Zugestellt',      color: 'bg-green-100 text-green-700 border-green-200' },
];

// ─── Accordion-Gruppe ────────────────────────────────────────────────────────

function AccordionGroup({
  groupKey,
  label,
  count,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  groupKey: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  const headerRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    const willOpen = !isOpen;
    onToggle(groupKey);
    if (willOpen) {
      // Nach State-Update zum Header scrollen
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          headerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
  };

  return (
    <div>
      {/* Header – sticky wenn offen */}
      <div
        ref={headerRef}
        onClick={handleClick}
        className={`flex items-center justify-between px-1 py-2.5 cursor-pointer select-none transition-colors rounded-xl ${
          isOpen
            ? 'sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm shadow-sm'
            : 'hover:bg-gray-100/60'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0">{icon}</div>
          <span className="text-sm font-semibold text-gray-700 truncate capitalize">{label}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">· {count}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </div>

      {/* Inhalt */}
      {isOpen && (
        <div className="space-y-2 pt-1 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Orders Tab ──────────────────────────────────────────────────────────────

const LS_OPEN_GROUP  = 'orders_open_group';
const LS_GROUP_MODE  = 'orders_group_mode';
const LS_ACTIVE_FILTER = 'orders_active_filter';

function OrdersTab({
  orders,
  loading,
  onRefresh,
  onAddEmail,
}: {
  orders: Order[];
  loading: boolean;
  onRefresh: () => void;
  onAddEmail: () => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string>(
    () => localStorage.getItem(LS_ACTIVE_FILTER) ?? 'all',
  );
  // Ansichtsmodus aus localStorage wiederherstellen
  const [groupByShop, setGroupByShop] = useState<boolean>(
    () => localStorage.getItem(LS_GROUP_MODE) === 'shop',
  );
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => localStorage.getItem(LS_OPEN_GROUP),
  );

  // Modus-Wechsel in localStorage speichern
  const handleSetGroupByShop = (v: boolean) => {
    setGroupByShop(v);
    localStorage.setItem(LS_GROUP_MODE, v ? 'shop' : 'month');
  };

  // Nur Filter anzeigen, die tatsächlich vorkommen
  const presentStatuses = new Set(orders.map(o => o.status.toLowerCase()));
  const visibleFilters = STATUS_FILTERS.filter(
    f => f.value === 'all' || presentStatuses.has(f.value),
  );

  const filteredOrders = activeFilter === 'all'
    ? orders
    : orders.filter(o => o.status.toLowerCase() === activeFilter);

  // Gruppierung nach Anbieter
  const groupedByShop: { key: string; label: string; orders: Order[] }[] = groupByShop
    ? Object.entries(
        filteredOrders.reduce<Record<string, Order[]>>((acc, o) => {
          const key = o.shop || 'Unbekannt';
          (acc[key] ??= []).push(o);
          return acc;
        }, {}),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([shop, orders]) => ({ key: shop, label: shop, orders }))
    : [];

  // Gruppierung nach Monat + Jahr (normale Ansicht)
  const groupedByMonth: { label: string; key: string; orders: Order[] }[] = (() => {
    const acc: Record<string, Order[]> = {};
    for (const o of filteredOrders) {
      const date = o.orderDate ? new Date(o.orderDate) : null;
      const key  = date ? format(date, 'yyyy-MM') : 'unknown';
      const label = date ? format(date, 'MMMM yyyy', { locale: de }) : 'Datum unbekannt';
      if (!acc[key]) acc[key] = [];
      acc[key].push(o);
      (acc[key] as Order[] & { _label?: string })._label = label;
    }
    return Object.entries(acc)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, orders]) => ({
        key,
        label: (orders as Order[] & { _label?: string })._label ?? 'Datum unbekannt',
        orders,
      }));
  })();

  const activeGroups = groupByShop ? groupedByShop : groupedByMonth;

  // Beim ersten Laden: gespeicherte Gruppe öffnen oder erste Gruppe als Standard
  const initializedRef = useRef(false);
  useEffect(() => {
    if (activeGroups.length === 0) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    const keys = activeGroups.map(g => g.key);
    const saved = localStorage.getItem(LS_OPEN_GROUP);
    const valid = saved && keys.includes(saved) ? saved : keys[0];
    setOpenGroup(valid);
  }, [activeGroups.length > 0]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Beim Wechsel des Gruppierungsmodus oder Filters: erste Gruppe der neuen Ansicht öffnen
  const prevGroupModeRef = useRef(groupByShop);
  const prevFilterRef = useRef(activeFilter);
  useEffect(() => {
    const modeChanged = prevGroupModeRef.current !== groupByShop;
    const filterChanged = prevFilterRef.current !== activeFilter;
    prevGroupModeRef.current = groupByShop;
    prevFilterRef.current = activeFilter;
    if (!initializedRef.current) return;
    if (!modeChanged && !filterChanged) return;
    if (activeGroups.length === 0) return;
    setOpenGroup(activeGroups[0].key);
  }, [groupByShop, activeFilter]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleGroup = (key: string) => {
    setOpenGroup(prev => {
      // Gruppe anklicken: öffnen oder schließen (Toggle)
      const next = prev === key ? null : key;
      if (next) localStorage.setItem(LS_OPEN_GROUP, next);
      return next;
    });
  };

  return (
    <div className="px-4 py-4">
      <PushPromptBanner />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">Meine Bestellungen</h2>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <button
              onClick={() => handleSetGroupByShop(!groupByShop)}
              title="Nach Anbieter gruppieren"
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-medium border transition-all ${
                groupByShop
                  ? 'bg-blue-600 text-white border-transparent shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              Anbieter
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!loading && orders.length > 0 && (
        <div className="mb-3">
          <DeliveryScheduleView orders={orders} hideWhenEmpty omitEmptyWeeks />
        </div>
      )}

      {/* Status-Filter – alle Chips gleichmäßig in einer Zeile */}
      {!loading && orders.length > 0 && visibleFilters.length > 1 && (
        <div className="flex gap-1 mb-3">
          {visibleFilters.map(f => (
            <button
              key={f.value}
              onClick={() => { setActiveFilter(f.value); localStorage.setItem(LS_ACTIVE_FILTER, f.value); }}
              className={`flex-1 min-w-0 text-xs font-medium px-1 py-1.5 rounded-full border transition-all truncate ${
                activeFilter === f.value
                  ? f.color + ' border-transparent shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="truncate">{f.label}</span>
              {f.value !== 'all' && (
                <span className="ml-0.5 opacity-60">
                  {orders.filter(o => o.status.toLowerCase() === f.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Inhalte */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Keine Bestellungen</h3>
          <p className="text-gray-400 text-sm mb-6">
            Synchronisiere deine E-Mails, um Bestellungen automatisch zu erkennen.
          </p>
          <button
            onClick={onAddEmail}
            className="inline-flex items-center gap-2 py-3 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            E-Mail-Konto verbinden
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-400 text-sm">Keine Bestellungen mit diesem Status.</p>
          <button onClick={() => { setActiveFilter('all'); localStorage.setItem(LS_ACTIVE_FILTER, 'all'); }} className="mt-3 text-sm text-blue-600 hover:underline">
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {activeGroups.map(({ key, label, orders: groupOrders }) => (
            <AccordionGroup
              key={key}
              groupKey={key}
              label={label}
              count={groupOrders.length}
              isOpen={openGroup === key}
              onToggle={handleToggleGroup}
              icon={
                groupByShop ? (
                  <div className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Store className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                ) : (
                  <div className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-400 text-xs font-bold">
                      {label.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )
              }
            >
              {groupOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </AccordionGroup>
          ))}
        </div>
      )}
    </div>
  );
}
