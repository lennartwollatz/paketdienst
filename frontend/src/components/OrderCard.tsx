import { useNavigate } from 'react-router-dom';
import { Package, ChevronRight, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Order } from '../api/orders';
import StatusBadge from './StatusBadge';
import CategoryChip from './CategoryChip';
import { orderDeliveryDisplayDate } from '../lib/orderDates';

interface OrderCardProps {
  order: Order;
}

export default function OrderCard({ order }: OrderCardProps) {
  const navigate = useNavigate();
  const latestEvent = order.trackingEvents?.[0];
  const displayDate = orderDeliveryDisplayDate(order);

  return (
    <button
      onClick={() => navigate(`/orders/${order.id}`)}
      className="w-full card hover:shadow-md active:scale-[0.99] transition-all duration-150 text-left"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <Package className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{order.shop}</h3>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <StatusBadge status={order.status} />
            <CategoryChip categoryId={order.category} />
            {order.carrier && (
              <span className="text-xs text-gray-400">{order.carrier}</span>
            )}
          </div>

          {latestEvent && (
            <div className="flex items-center gap-1 mt-1.5">
              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <p className="text-xs text-gray-500 truncate">{latestEvent.description}</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">
              {displayDate
                ? format(displayDate, 'd. MMM yyyy', { locale: de })
                : 'Lieferdatum unbekannt'}
            </span>
            {order.price != null && (
              <span className="text-sm font-semibold text-gray-700">
                {order.price.toFixed(2)} {order.currency || 'EUR'}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
