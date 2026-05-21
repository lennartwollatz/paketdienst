import { addDays, format, parseISO, isValid } from 'date-fns';
import type { Order } from '../api/orders';

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function deliveryDateKey(order: Order): string | null {
  if (!order.estimatedDelivery) return null;
  const d = parseISO(order.estimatedDelivery);
  if (!isValid(d)) return null;
  return format(d, 'yyyy-MM-dd');
}

function eventUid(order: Order): string {
  return `paketdienst-${order.id}@paketdienst`;
}

function buildEvent(order: Order): string | null {
  const dateKey = deliveryDateKey(order);
  if (!dateKey) return null;

  const d = parseISO(dateKey);
  const dtStart = format(d, 'yyyyMMdd');
  const dtEnd = format(addDays(d, 1), 'yyyyMMdd');

  const title = `Lieferung: ${order.shop}`;
  const parts: string[] = [];
  if (order.orderNumber) parts.push(`Bestellnr.: ${order.orderNumber}`);
  if (order.trackingNumber) parts.push(`Tracking: ${order.trackingNumber}`);
  if (order.carrier) parts.push(`Dienstleister: ${order.carrier}`);
  parts.push('Erstellt mit Paketdienst');

  const description = escapeIcs(parts.join('\n'));
  const location = order.deliveryAddress ? escapeIcs(order.deliveryAddress) : '';
  const dtStamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

  return [
    'BEGIN:VEVENT',
    `UID:${eventUid(order)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${description}`,
    ...(location ? [`LOCATION:${location}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(`Lieferung erwartet: ${order.shop}`)}`,
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

export function buildIcsForOrders(orders: Order[], calendarName?: string): string | null {
  const events = orders
    .map(buildEvent)
    .filter((e): e is string => e != null);
  if (events.length === 0) return null;

  const calNameLine = calendarName
    ? [`X-WR-CALNAME:${escapeIcs(calendarName)}`, `NAME:${escapeIcs(calendarName)}`]
    : [];

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Paketdienst//Lieferungen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...calNameLine,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadOrderDeliveryReminder(order: Order): boolean {
  const ics = buildIcsForOrders([order]);
  if (!ics) return false;
  const dateKey = deliveryDateKey(order) ?? 'lieferung';
  downloadIcsFile(`lieferung-${order.shop.replace(/\s+/g, '-')}-${dateKey}.ics`, ics);
  return true;
}

export function downloadOrdersDeliveryReminders(
  orders: Order[],
  filename: string,
  calendarName?: string,
): boolean {
  const ics = buildIcsForOrders(orders, calendarName);
  if (!ics) return false;
  downloadIcsFile(filename, ics);
  return true;
}
