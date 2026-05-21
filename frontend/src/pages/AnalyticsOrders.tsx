import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ordersApi, Order } from '../api/orders';
import OrderCard from '../components/OrderCard';
import CategoryIcon from '../components/CategoryIcon';
import {
  analyticsDrillTitle,
  analyticsDrillTotal,
  filterAnalyticsDrillOrders,
  parseAnalyticsDrillParams,
} from '../lib/analyticsDrillDown';
import { formatCurrency, type AnalyticsMetric } from '../lib/expenseStats';

export default function AnalyticsOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const drillParams = useMemo(
    () => parseAnalyticsDrillParams(searchParams.toString()),
    [searchParams],
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await ordersApi.getAll();
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!drillParams) {
      navigate('/analytics', { replace: true });
      return;
    }
    loadOrders();
  }, [drillParams, loadOrders, navigate]);

  const filtered = useMemo(() => {
    if (!drillParams) return [];
    return filterAnalyticsDrillOrders(orders, drillParams);
  }, [orders, drillParams]);

  if (!drillParams) {
    return null;
  }

  const title = analyticsDrillTitle(drillParams);
  const metric: AnalyticsMetric = drillParams.metric;
  const total = analyticsDrillTotal(filtered, metric);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Zurück zu Analytics"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Bestellungen</p>
            <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2 min-w-0">
              {drillParams.categoryId && (
                <CategoryIcon
                  categoryId={drillParams.categoryId}
                  className="w-5 h-5 text-gray-600 flex-shrink-0"
                />
              )}
              <span className="truncate">{title}</span>
            </h1>
            {!loading && (
              <p className="text-sm text-gray-500 mt-0.5">
                {filtered.length} Bestellung{filtered.length !== 1 ? 'en' : ''}
                {metric === 'amount' ? ` · ${formatCurrency(total)}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse h-24 bg-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">
            {metric === 'amount'
              ? 'Keine Bestellungen mit Preis in diesem Zeitraum.'
              : 'Keine Bestellungen in diesem Zeitraum.'}
          </p>
        ) : (
          filtered.map((o) => <OrderCard key={o.id} order={o} />)
        )}
      </div>
    </div>
  );
}
