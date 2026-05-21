import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, isValid, addMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Order } from '../api/orders';
import { categoryLabel, ORDER_CATEGORIES } from '../constants/orderCategories';

export const UNCATEGORIZED_ID = '__uncategorized__';

export type AnalyticsMetric = 'amount' | 'count';

export function expenseDate(order: Order): Date {
  const raw = order.orderDate ?? order.createdAt;
  const d = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
  return isValid(d) ? d : new Date();
}

export function expenseAmount(order: Order): number | null {
  if (order.price == null || Number.isNaN(order.price)) return null;
  return order.price;
}

export function hasExpense(order: Order): boolean {
  const amount = expenseAmount(order);
  return amount != null && amount > 0;
}

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

/** Kurzlabel für Diagramm-Achse: 3 Zeichen + Punkt, außer Mai ohne Punkt. */
const MONTH_SHORT: Record<number, string> = {
  1: 'Jan.',
  2: 'Feb.',
  3: 'Mär.',
  4: 'Apr.',
  5: 'Mai',
  6: 'Jun.',
  7: 'Jul.',
  8: 'Aug.',
  9: 'Sep.',
  10: 'Okt.',
  11: 'Nov.',
  12: 'Dez.',
};

export function monthLabelShort(key: string): string {
  const d = parseISO(`${key}-01`);
  if (!isValid(d)) return key;
  return MONTH_SHORT[d.getMonth() + 1] ?? key;
}

/** Anzeige in Drill-down / Tooltips (voller Monatsname + Jahr). */
export function monthLabel(key: string): string {
  const d = parseISO(`${key}-01`);
  return isValid(d) ? format(d, 'MMMM yyyy', { locale: de }) : key;
}

/** Jahreszahl(en) für Diagramm-Kopfzeile aus Monats-Keys (yyyy-MM). */
export function yearLabelFromMonthKeys(keys: string[]): string | null {
  const years = [...new Set(
    keys
      .map((k) => k.slice(0, 4))
      .filter((y) => /^\d{4}$/.test(y)),
  )].sort();
  if (years.length === 0) return null;
  if (years.length === 1) return years[0];
  return `${years[0]}–${years[years.length - 1]}`;
}

export function categoryKey(order: Order): string {
  return order.category?.trim() || UNCATEGORIZED_ID;
}

export function categoryDisplayLabel(id: string): string {
  if (id === UNCATEGORIZED_ID) return 'Ohne Kategorie';
  return categoryLabel(id) ?? id;
}

export interface ChartBar {
  key: string;
  label: string;
  /** Gesamtbetrag */
  value: number;
  /** Zugestellt */
  delivered: number;
  /** Noch nicht zugestellt */
  pending: number;
}

export function isOrderDelivered(order: Order): boolean {
  return order.status.toLowerCase() === 'delivered';
}

export function qualifiesForAnalytics(order: Order, metric: AnalyticsMetric): boolean {
  if (metric === 'count') return true;
  return hasExpense(order);
}

function orderContribution(order: Order, metric: AnalyticsMetric): number {
  if (metric === 'count') return 1;
  const amount = expenseAmount(order);
  return amount != null && amount > 0 ? amount : 0;
}

function addMetricSplit(
  map: Map<string, { delivered: number; pending: number }>,
  key: string,
  order: Order,
  metric: AnalyticsMetric,
): void {
  const contribution = orderContribution(order, metric);
  if (contribution <= 0) return;
  const cur = map.get(key) ?? { delivered: 0, pending: 0 };
  if (isOrderDelivered(order)) {
    cur.delivered += contribution;
  } else {
    cur.pending += contribution;
  }
  map.set(key, cur);
}

function toChartBar(key: string, label: string, parts: { delivered: number; pending: number }): ChartBar {
  return {
    key,
    label,
    delivered: parts.delivered,
    pending: parts.pending,
    value: parts.delivered + parts.pending,
  };
}

const EMPTY_MONTH_PARTS = { delivered: 0, pending: 0 };

/** Alle Monats-Keys (yyyy-MM) eines Kalenderjahres, Jan.–Dez. */
export function allMonthKeysForYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => format(new Date(year, i, 1), 'yyyy-MM'));
}

function chartBarsFromMonthMap(
  map: Map<string, { delivered: number; pending: number }>,
  monthKeys: string[],
): ChartBar[] {
  return monthKeys.map((key) => {
    const parts = map.get(key) ?? EMPTY_MONTH_PARTS;
    return toChartBar(key, monthLabelShort(key), parts);
  });
}

function isOrderInYear(order: Order, year: number): boolean {
  return expenseDate(order).getFullYear() === year;
}

export function ordersInMonth(
  orders: Order[],
  key: string,
  metric: AnalyticsMetric = 'amount',
): Order[] {
  return orders.filter(
    (o) => qualifiesForAnalytics(o, metric) && monthKey(expenseDate(o)) === key,
  );
}

export function ordersInRange(
  orders: Order[],
  start: Date,
  end: Date,
  metric: AnalyticsMetric = 'amount',
): Order[] {
  return orders.filter((o) => {
    if (!qualifiesForAnalytics(o, metric)) return false;
    const d = expenseDate(o);
    return d >= start && d <= end;
  });
}

export function ordersForCategoryInRange(
  orders: Order[],
  categoryId: string,
  start: Date,
  end: Date,
  metric: AnalyticsMetric = 'amount',
): Order[] {
  return ordersInRange(orders, start, end, metric).filter((o) => categoryKey(o) === categoryId);
}

export function sumOrders(orders: Order[]): number {
  return orders.reduce((sum, o) => sum + (expenseAmount(o) ?? 0), 0);
}

export function aggregateMetricTotal(orders: Order[], metric: AnalyticsMetric): number {
  if (metric === 'count') return orders.length;
  return sumOrders(orders);
}

/** Monatsdurchschnitt über alle Balken (z. B. 12 Monate eines Jahres). */
export function yearlyMonthlyAverage(bars: ChartBar[]): number {
  if (bars.length === 0) return 0;
  const total = bars.reduce((sum, b) => sum + b.value, 0);
  return total / bars.length;
}

/** Gesamtausgaben / Bestellanzahl pro Monat; immer alle 12 Monate des Jahres. */
export function aggregateByMonth(
  orders: Order[],
  metric: AnalyticsMetric,
  year: number = new Date().getFullYear(),
): ChartBar[] {
  const map = new Map<string, { delivered: number; pending: number }>();
  for (const o of orders) {
    if (!qualifiesForAnalytics(o, metric) || !isOrderInYear(o, year)) continue;
    addMetricSplit(map, monthKey(expenseDate(o)), o, metric);
  }
  return chartBarsFromMonthMap(map, allMonthKeysForYear(year));
}

/** Ausgaben / Bestellanzahl pro Kategorie in einem Zeitraum. */
export function aggregateByCategory(
  orders: Order[],
  start: Date,
  end: Date,
  metric: AnalyticsMetric,
): ChartBar[] {
  const inRange = ordersInRange(orders, start, end, metric);
  const map = new Map<string, { delivered: number; pending: number }>();
  for (const o of inRange) {
    addMetricSplit(map, categoryKey(o), o, metric);
  }

  const knownIds = new Set<string>(ORDER_CATEGORIES.map((c) => c.id));
  const bars: ChartBar[] = [];

  for (const c of ORDER_CATEGORIES) {
    const parts = map.get(c.id);
    if (parts != null && parts.delivered + parts.pending > 0) {
      bars.push(toChartBar(c.id, c.label, parts));
    }
  }
  const other = map.get(UNCATEGORIZED_ID);
  if (other != null && other.delivered + other.pending > 0) {
    bars.push(toChartBar(UNCATEGORIZED_ID, categoryDisplayLabel(UNCATEGORIZED_ID), other));
  }
  for (const [id, parts] of map) {
    if (!knownIds.has(id) && id !== UNCATEGORIZED_ID && parts.delivered + parts.pending > 0) {
      bars.push(toChartBar(id, categoryDisplayLabel(id), parts));
    }
  }

  return sortCategoryBars(bars);
}

/** Nach Betrag absteigend, „Ohne Kategorie“ immer zuletzt. */
export function sortCategoryBars(bars: ChartBar[]): ChartBar[] {
  const uncategorized = bars.filter((b) => b.key === UNCATEGORIZED_ID);
  const rest = bars
    .filter((b) => b.key !== UNCATEGORIZED_ID)
    .sort((a, b) => b.value - a.value);
  return [...rest, ...uncategorized];
}

/** Kategorie-IDs sortieren: alphabetisch, „Ohne Kategorie“ am Ende. */
export function sortCategoryIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    if (a === UNCATEGORIZED_ID) return 1;
    if (b === UNCATEGORIZED_ID) return -1;
    return categoryDisplayLabel(a).localeCompare(categoryDisplayLabel(b), 'de');
  });
}

/** Monatsausgaben / -anzahl für eine Kategorie; immer alle 12 Monate des Jahres. */
export function aggregateCategoryByMonth(
  orders: Order[],
  categoryId: string,
  metric: AnalyticsMetric,
  year: number = new Date().getFullYear(),
): ChartBar[] {
  const map = new Map<string, { delivered: number; pending: number }>();
  for (const o of orders) {
    if (
      !qualifiesForAnalytics(o, metric)
      || categoryKey(o) !== categoryId
      || !isOrderInYear(o, year)
    ) {
      continue;
    }
    addMetricSplit(map, monthKey(expenseDate(o)), o, metric);
  }
  return chartBarsFromMonthMap(map, allMonthKeysForYear(year));
}

export function currentMonthKey(): string {
  return format(new Date(), 'yyyy-MM');
}

export function monthRangeFromKey(key: string): { start: Date; end: Date; label: string; key: string } {
  const start = startOfMonth(parseISO(`${key}-01`));
  const end = endOfMonth(start);
  return { start, end, label: monthLabel(key), key };
}

export function shiftMonthKey(key: string, delta: number): string {
  const next = addMonths(parseISO(`${key}-01`), delta);
  return format(next, 'yyyy-MM');
}

/** Alle Monate zwischen erstem und letztem Eintrag + gewählter Monat (neueste zuerst). */
export function monthPickerOptions(
  orders: Order[],
  selectedKey: string,
  metric: AnalyticsMetric,
): { key: string; label: string }[] {
  const keys = new Set<string>([selectedKey]);
  let min: string | null = null;
  let max: string | null = null;
  for (const o of orders) {
    if (!qualifiesForAnalytics(o, metric)) continue;
    const k = monthKey(expenseDate(o));
    keys.add(k);
    if (!min || k < min) min = k;
    if (!max || k > max) max = k;
  }
  if (min && max) {
    let cursor = startOfMonth(parseISO(`${min}-01`));
    const end = startOfMonth(parseISO(`${max}-01`));
    while (cursor <= end) {
      keys.add(format(cursor, 'yyyy-MM'));
      cursor = addMonths(cursor, 1);
    }
  }
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: monthLabel(key) }));
}

export function currentMonthRange(): { start: Date; end: Date; label: string } {
  return monthRangeFromKey(currentMonthKey());
}

export function currentCalendarYear(): number {
  return new Date().getFullYear();
}

export function currentYearRange(): { start: Date; end: Date; label: string } {
  return yearRangeForYear(currentCalendarYear());
}

export function yearRangeForYear(year: number): { start: Date; end: Date; label: string } {
  const start = startOfYear(new Date(year, 0, 1));
  const end = endOfYear(start);
  return { start, end, label: String(year) };
}

export function shiftYear(year: number, delta: number): number {
  return year + delta;
}

/** Jahre mit Daten + aktuelles und gewähltes Jahr (neueste zuerst). */
export function yearPickerOptions(
  orders: Order[],
  selectedYear: number,
  metric: AnalyticsMetric,
): { key: number; label: string }[] {
  const years = new Set<number>([selectedYear, currentCalendarYear()]);
  for (const o of orders) {
    if (!qualifiesForAnalytics(o, metric)) continue;
    years.add(expenseDate(o).getFullYear());
  }
  return [...years]
    .sort((a, b) => b - a)
    .map((y) => ({ key: y, label: String(y) }));
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatChartValue(value: number, metric: AnalyticsMetric): string {
  if (metric === 'count') return String(Math.round(value));
  return formatCurrency(value);
}

export function formatDeliveredPending(
  delivered: number,
  pending: number,
  metric: AnalyticsMetric,
): string {
  if (metric === 'count') {
    return `geliefert ${Math.round(delivered)}, offen ${Math.round(pending)}`;
  }
  return `geliefert ${formatCurrency(delivered)}, offen ${formatCurrency(pending)}`;
}
