import { endOfMonth, parseISO, startOfMonth } from 'date-fns';
import type { Order } from '../api/orders';
import {
  aggregateMetricTotal,
  categoryDisplayLabel,
  monthLabel,
  monthRangeFromKey,
  ordersForCategoryInRange,
  ordersInMonth,
  yearRangeForYear,
  type AnalyticsMetric,
} from './expenseStats';

export type AnalyticsDrillKind =
  | 'month'
  | 'category_year'
  | 'category_month'
  | 'category_month_bar';

export interface AnalyticsDrillParams {
  kind: AnalyticsDrillKind;
  metric: AnalyticsMetric;
  monthKey?: string;
  year?: number;
  categoryId?: string;
}

export function analyticsOrdersPath(params: AnalyticsDrillParams): string {
  const sp = new URLSearchParams();
  sp.set('kind', params.kind);
  sp.set('metric', params.metric);
  if (params.monthKey) sp.set('month', params.monthKey);
  if (params.year != null) sp.set('year', String(params.year));
  if (params.categoryId) sp.set('category', params.categoryId);
  return `/analytics/orders?${sp.toString()}`;
}

export function parseAnalyticsDrillParams(
  search: string,
): AnalyticsDrillParams | null {
  const sp = new URLSearchParams(search);
  const kind = sp.get('kind') as AnalyticsDrillKind | null;
  const metric = sp.get('metric') as AnalyticsMetric | null;
  if (!kind || !metric || (metric !== 'amount' && metric !== 'count')) return null;

  const monthKey = sp.get('month') ?? undefined;
  const yearRaw = sp.get('year');
  const year = yearRaw ? Number(yearRaw) : undefined;
  const categoryId = sp.get('category') ?? undefined;

  switch (kind) {
    case 'month':
      if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return null;
      return { kind, metric, monthKey };
    case 'category_year':
      if (!categoryId || !year || Number.isNaN(year)) return null;
      return { kind, metric, categoryId, year };
    case 'category_month':
    case 'category_month_bar':
      if (!categoryId || !monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return null;
      return { kind, metric, categoryId, monthKey };
    default:
      return null;
  }
}

export function analyticsDrillTitle(params: AnalyticsDrillParams): string {
  switch (params.kind) {
    case 'month':
      return monthLabel(params.monthKey!);
    case 'category_year':
      return `${categoryDisplayLabel(params.categoryId!)} · ${params.year}`;
    case 'category_month':
    case 'category_month_bar':
      return `${categoryDisplayLabel(params.categoryId!)} · ${monthLabel(params.monthKey!)}`;
    default:
      return 'Bestellungen';
  }
}

export function filterAnalyticsDrillOrders(
  orders: Order[],
  params: AnalyticsDrillParams,
): Order[] {
  switch (params.kind) {
    case 'month':
      return ordersInMonth(orders, params.monthKey!, params.metric);
    case 'category_year': {
      const range = yearRangeForYear(params.year!);
      return ordersForCategoryInRange(
        orders,
        params.categoryId!,
        range.start,
        range.end,
        params.metric,
      );
    }
    case 'category_month': {
      const range = monthRangeFromKey(params.monthKey!);
      return ordersForCategoryInRange(
        orders,
        params.categoryId!,
        range.start,
        range.end,
        params.metric,
      );
    }
    case 'category_month_bar': {
      const start = startOfMonth(parseISO(`${params.monthKey!}-01`));
      const end = endOfMonth(start);
      return ordersForCategoryInRange(
        orders,
        params.categoryId!,
        start,
        end,
        params.metric,
      );
    }
    default:
      return [];
  }
}

export function analyticsDrillTotal(orders: Order[], metric: AnalyticsMetric): number {
  return aggregateMetricTotal(orders, metric);
}
