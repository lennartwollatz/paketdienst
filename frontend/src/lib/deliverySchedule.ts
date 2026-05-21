import {
  addWeeks,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfWeek,
  isValid,
} from 'date-fns';
import { de } from 'date-fns/locale';
import type { Order } from '../api/orders';
import { isOrderDelivered } from './expenseStats';

const WEEK_OPTS = { locale: de, weekStartsOn: 1 as const };

export interface DeliveryWeekRange {
  key: 'this' | 'next';
  label: string;
  subtitle: string;
  start: Date;
  end: Date;
}

export interface DeliveryWeekGroup {
  week: DeliveryWeekRange;
  orders: Order[];
}

function parseEstimatedDelivery(order: Order): Date | null {
  if (!order.estimatedDelivery) return null;
  const d = parseISO(order.estimatedDelivery);
  return isValid(d) ? startOfDay(d) : null;
}

export function getDeliveryWeekRanges(reference = new Date()): {
  thisWeek: DeliveryWeekRange;
  nextWeek: DeliveryWeekRange;
} {
  const thisStart = startOfWeek(reference, WEEK_OPTS);
  const thisEnd = endOfWeek(reference, WEEK_OPTS);
  const nextStart = startOfWeek(addWeeks(reference, 1), WEEK_OPTS);
  const nextEnd = endOfWeek(addWeeks(reference, 1), WEEK_OPTS);

  const rangeLabel = (start: Date, end: Date) =>
    `${format(start, 'd. MMM', { locale: de })} – ${format(end, 'd. MMM yyyy', { locale: de })}`;

  return {
    thisWeek: {
      key: 'this',
      label: 'Lieferungen diese Woche',
      subtitle: rangeLabel(thisStart, thisEnd),
      start: thisStart,
      end: thisEnd,
    },
    nextWeek: {
      key: 'next',
      label: 'Lieferungen nächste Woche',
      subtitle: rangeLabel(nextStart, nextEnd),
      start: nextStart,
      end: nextEnd,
    },
  };
}

export function isPendingDeliveryWithEta(order: Order): boolean {
  if (isOrderDelivered(order)) return false;
  return parseEstimatedDelivery(order) != null;
}

export function groupOrdersByDeliveryWeek(
  orders: Order[],
  reference = new Date(),
): DeliveryWeekGroup[] {
  const { thisWeek, nextWeek } = getDeliveryWeekRanges(reference);
  const weeks = [thisWeek, nextWeek];

  const buckets = new Map<'this' | 'next', Order[]>(
    weeks.map((w) => [w.key, []]),
  );

  for (const order of orders) {
    if (!isPendingDeliveryWithEta(order)) continue;
    const eta = parseEstimatedDelivery(order)!;

    for (const week of weeks) {
      if (isWithinInterval(eta, { start: week.start, end: week.end })) {
        buckets.get(week.key)!.push(order);
        break;
      }
    }
  }

  const sortByEta = (a: Order, b: Order) => {
    const da = parseEstimatedDelivery(a)!.getTime();
    const db = parseEstimatedDelivery(b)!.getTime();
    if (da !== db) return da - db;
    return a.shop.localeCompare(b.shop, 'de');
  };

  return weeks.map((week) => ({
    week,
    orders: buckets.get(week.key)!.sort(sortByEta),
  }));
}

export function formatEstimatedDelivery(order: Order): string | null {
  const d = parseEstimatedDelivery(order);
  if (!d) return null;
  return format(d, 'EEEE, d. MMMM', { locale: de });
}

export function formatEstimatedDeliveryShort(order: Order): string | null {
  const d = parseEstimatedDelivery(order);
  if (!d) return null;
  return format(d, 'EEE, d. MMM', { locale: de });
}
