import { isValid, parseISO } from 'date-fns';
import type { Order, TrackingEvent } from '../api/orders';
import { isOrderDelivered } from './expenseStats';

const DELIVERED_DESC = /zugestellt|geliefert|delivered|angekommen|abgeholt/i;

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = parseISO(raw);
  return isValid(d) ? d : null;
}

function isDeliveredEvent(event: TrackingEvent): boolean {
  if (event.status.toLowerCase() === 'delivered') return true;
  return DELIVERED_DESC.test(event.description);
}

/** Zeitpunkt der Zustellung aus Tracking-Ereignissen (frühestes Liefer-Event). */
function deliveredEventDate(events: TrackingEvent[]): Date | null {
  const delivered = events.filter(isDeliveredEvent);
  if (delivered.length === 0) return null;

  let earliest: Date | null = null;
  for (const event of delivered) {
    const d = parseDate(event.timestamp);
    if (!d) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

/**
 * Datum für Bestellkarten: voraussichtliche Lieferung oder Zustellzeitpunkt.
 */
export function orderDeliveryDisplayDate(order: Order): Date | null {
  if (isOrderDelivered(order)) {
    return (
      deliveredEventDate(order.trackingEvents ?? [])
      ?? parseDate(order.estimatedDelivery)
    );
  }
  return parseDate(order.estimatedDelivery);
}
