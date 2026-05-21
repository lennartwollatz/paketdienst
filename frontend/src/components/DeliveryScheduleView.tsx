import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Order } from '../api/orders';
import StatusBadge from './StatusBadge';
import CategoryChip from './CategoryChip';
import {
  formatEstimatedDelivery,
  formatEstimatedDeliveryShort,
  groupOrdersByDeliveryWeek,
} from '../lib/deliverySchedule';
import {
  downloadOrderDeliveryReminder,
  downloadOrdersDeliveryReminders,
} from '../lib/calendarExport';

interface Props {
  orders: Order[];
  /** Nichts rendern, wenn keine Lieferungen in Sicht. */
  hideWhenEmpty?: boolean;
  /** Wochen ohne Einträge ausblenden. */
  omitEmptyWeeks?: boolean;
}

export default function DeliveryScheduleView({
  orders,
  hideWhenEmpty = false,
  omitEmptyWeeks = false,
}: Props) {
  const navigate = useNavigate();
  const weekGroups = useMemo(() => groupOrdersByDeliveryWeek(orders), [orders]);
  const totalCount = weekGroups.reduce((n, g) => n + g.orders.length, 0);

  const handleAddOne = (order: Order) => {
    if (downloadOrderDeliveryReminder(order)) {
      toast.success('Kalenderdatei heruntergeladen');
    } else {
      toast.error('Kein Lieferdatum vorhanden');
    }
  };

  const handleAddAll = (weekOrders: Order[], filename: string, calendarName: string) => {
    if (downloadOrdersDeliveryReminders(weekOrders, filename, calendarName)) {
      toast.success(`${weekOrders.length} Termine als Kalenderdatei`);
    }
  };

  if (totalCount === 0) {
    if (hideWhenEmpty) return null;
    return (
      <div className="card text-center py-12 px-4">
        <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">Keine Lieferungen geplant</p>
        <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
          Für diese oder nächste Woche liegen keine voraussichtlichen Liefertermine bei offenen
          Bestellungen vor.
        </p>
      </div>
    );
  }

  const visibleWeeks = omitEmptyWeeks
    ? weekGroups.filter((g) => g.orders.length > 0)
    : weekGroups;

  return (
    <div className="space-y-3">
      {visibleWeeks.map(({ week, orders: weekOrders }) => {
        if (weekOrders.length === 0) {
          return (
            <section key={week.key} className="card">
              <div className="mb-1">
                <h2 className="text-sm font-semibold text-gray-800">{week.label}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{week.subtitle}</p>
              </div>
              <p className="text-sm text-gray-400 text-center py-6">Keine Lieferungen</p>
            </section>
          );
        }

        return (
          <section key={week.key} className="card py-3">
            <div className="flex items-center justify-between gap-2 mb-2 px-1">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-800 leading-tight">{week.label}</h2>
                <p className="text-xs text-gray-400">{week.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleAddAll(
                    weekOrders,
                    `lieferungen-${week.key === 'this' ? 'diese-woche' : 'naechste-woche'}.ics`,
                    week.label,
                  )
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Alle
              </button>
            </div>

            <ul className="divide-y divide-gray-100 px-1">
              {weekOrders.map((order) => (
                <li key={order.id} className="flex items-center gap-1 py-2 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="flex-1 min-w-0 text-left rounded-lg py-0.5 hover:bg-gray-50 active:opacity-80"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{order.shop}</p>
                      <span className="text-xs text-blue-700 font-medium flex-shrink-0">
                        {formatEstimatedDeliveryShort(order)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 min-w-0">
                      <StatusBadge status={order.status} />
                      <CategoryChip categoryId={order.category} />
                      {order.carrier && (
                        <span className="text-xs text-gray-400 truncate">{order.carrier}</span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddOne(order)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    aria-label={`${formatEstimatedDelivery(order) ?? 'Lieferung'} zum Kalender hinzufügen`}
                    title="Zum Kalender hinzufügen"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
