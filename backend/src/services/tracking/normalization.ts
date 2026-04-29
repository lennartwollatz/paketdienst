import { InternalTrackingStatus } from './types';

/**
 * Mapping von InternalTrackingStatus → Wert der in Order.status gespeichert wird.
 * Muss mit den Schlüsseln in StatusBadge.tsx (Frontend) übereinstimmen.
 */
export const INTERNAL_STATUS_TO_DB: Record<InternalTrackingStatus, string> = {
  info_received:    'processing',
  in_transit:       'in transit',
  out_for_delivery: 'in transit',     // "Im Versand" – kein eigener Status mehr
  in_packstation:   'in packstation',
  delivered:        'delivered',
  exception:        'in transit',
  unknown:          'unknown',
};

export function normalizeCarrierStatus(
  rawStatus: string | undefined,
  statusMap: Record<string, InternalTrackingStatus>
): InternalTrackingStatus {
  if (!rawStatus) return 'unknown';
  const key = rawStatus.trim().toLowerCase();
  return statusMap[key] ?? 'unknown';
}

/** Gibt den DB-Schlüssel zurück (z.B. "in transit", "delivered"). */
export function internalStatusToDb(status: InternalTrackingStatus): string {
  return INTERNAL_STATUS_TO_DB[status] ?? 'unknown';
}

/**
 * Erkennt anhand von Keywords in der Beschreibung, ob es sich um
 * einen Packstation-Event handelt.
 */
export function detectPackstationFromDescription(description: string): boolean {
  return /packstation|paketstation|parcel\s*locker|abholstation|locker/i.test(description);
}

export function dedupeEvents<T extends { timestamp: Date; status: string; location: string }>(
  events: T[]
): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.timestamp.toISOString()}::${event.status}::${event.location || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
