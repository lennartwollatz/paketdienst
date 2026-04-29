import { useEffect, useMemo, useState } from 'react';
import { X, Search, GitMerge, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { ordersApi, Order } from '../api/orders';

interface MergeOrderModalProps {
  /** Die Bestellung, von der aus zusammengeführt wird (wird zur primären) */
  currentOrder: Order;
  onClose: () => void;
  /** Wird mit der zusammengeführten Bestellung aufgerufen */
  onMerged: (merged: Order) => void;
}

export default function MergeOrderModal({
  currentOrder,
  onClose,
  onMerged,
}: MergeOrderModalProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    ordersApi.getAll().then(({ data }) => {
      setOrders(data.filter(o => o.id !== currentOrder.id));
    }).catch(() => {
      toast.error('Bestellungen konnten nicht geladen werden');
    }).finally(() => setLoading(false));
  }, [currentOrder.id]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter(o =>
      o.shop.toLowerCase().includes(q) ||
      (o.orderNumber ?? '').toLowerCase().includes(q) ||
      (o.trackingNumber ?? '').toLowerCase().includes(q),
    );
  }, [orders, query]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (selected.size === 0) return;
    setMerging(true);
    try {
      const { data } = await ordersApi.merge(currentOrder.id, [...selected]);
      toast.success(`${selected.size + 1} Bestellungen zusammengeführt`);
      onMerged(data);
      onClose();
    } catch {
      toast.error('Zusammenführen fehlgeschlagen');
    } finally {
      setMerging(false);
    }
  };

  const statusLabel: Record<string, string> = {
    processing:      'In Bearbeitung',
    'in transit':    'Im Versand',
    'in packstation':'In Packstation',
    delivered:       'Zugestellt',
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto bg-white rounded-t-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-gray-800">Bestellung zusammenführen</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Primäre Bestellung */}
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
          <p className="text-xs text-indigo-500 font-medium mb-1">Primäre Bestellung (bleibt erhalten)</p>
          <p className="text-sm font-semibold text-gray-800">{currentOrder.shop}</p>
          {currentOrder.orderNumber && (
            <p className="text-xs text-gray-500">Nr. {currentOrder.orderNumber}</p>
          )}
        </div>

        {/* Suche */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Shop, Bestellnummer oder Trackingnummer..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">
              {query ? 'Keine Bestellungen gefunden' : 'Keine weiteren Bestellungen vorhanden'}
            </p>
          ) : (
            <div className="space-y-2 py-2">
              {filtered.map(order => {
                const isSelected = selected.has(order.id);
                return (
                  <button
                    key={order.id}
                    onClick={() => toggleSelect(order.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 truncate">{order.shop}</p>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {order.orderDate
                              ? format(new Date(order.orderDate), 'dd.MM.yy', { locale: de })
                              : '–'}
                          </span>
                        </div>
                        {order.orderNumber && (
                          <p className="text-xs text-gray-500 truncate">Nr. {order.orderNumber}</p>
                        )}
                        {order.trackingNumber && (
                          <p className="text-xs text-gray-400 truncate font-mono">{order.trackingNumber}</p>
                        )}
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {statusLabel[order.status] ?? order.status}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100">
          {selected.size > 0 && (
            <p className="text-xs text-gray-500 text-center mb-3">
              {selected.size} Bestellung{selected.size > 1 ? 'en' : ''} wird zusammengeführt und gelöscht
            </p>
          )}
          <button
            onClick={handleMerge}
            disabled={selected.size === 0 || merging}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 flex items-center justify-center gap-2"
          >
            {merging
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird zusammengeführt…</>
              : <><GitMerge className="w-4 h-4" /> Zusammenführen</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
