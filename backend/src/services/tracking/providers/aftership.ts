/**
 * AfterShip – universeller Tracking-Provider via offizielles Node.js SDK
 *
 * SDK:  https://github.com/AfterShip/tracking-sdk-nodejs
 * API:  https://api.aftership.com/tracking/2025-07
 * Auth: Header "as-api-key: <key>"
 *
 * Ablauf:
 *  1. Carrier-Slug ermitteln (couriers/detect)
 *  2. createTracking – registriert die Sendungsnummer (4003 = bereits bekannt, wird ignoriert)
 *  3. getTrackings – aktueller Status + Checkpoints
 */

import { AfterShip, AftershipError, AfterShipErrorCodes } from '@aftership/tracking-sdk';
import { dedupeEvents, detectPackstationFromDescription, internalStatusToDb } from '../normalization';
import { InternalTrackingStatus, TrackingProvider, TrackingProviderError, TrackingResult } from '../types';

// ─── Carrier-Slug-Mapping ─────────────────────────────────────────────────────
// Interne Carrier-Bezeichnungen → AfterShip slug

const CARRIER_SLUG_MAP: Record<string, string> = {
  'dhl':                   'dhl',
  'dhl-germany':           'dhl-germany',
  'dhl germany':           'dhl-germany',
  'dhl paket':             'dhl-germany',
  'dhl express':           'dhl',
  'deutsche-post':         'deutsche-post',
  'deutsche post':         'deutsche-post',
  'deutschepost':          'deutsche-post',
  'ups':                   'ups',
  'hermes':                'hermes-de',
  'hermes-germany':        'hermes-de',
  'hermes-de':             'hermes-de',
  'hermesworld':           'hermes',
  'myhermes':              'hermes-de',
  'dpd':                   'dpd-de',
  'dpd-germany':           'dpd-de',
  'dpd-de':                'dpd-de',
  'gls':                   'gls',
  'gls-germany':           'gls',
  'fedex':                 'fedex',
  'amazon':                'amazon',
  'amazon-logistics':      'amazon',
  'amazon logistics':      'amazon',
  'postnl':                'postnl',
  'post-nl':               'postnl',
  'evri':                  'evri',
  'tnt':                   'tnt',
  'schenker':              'db-schenker',
  'db-schenker':           'db-schenker',
  'chronopost':            'chronopost',
};

// ─── Status-Mapping ─────────────────────────────────────────────────────────────
// Quelle: https://www.aftership.com/docs/tracking/enum/delivery-statuses

const AS_TAG_MAP: Record<string, InternalTrackingStatus> = {
  pending:              'unknown',
  inforeceived:         'info_received',
  intransit:            'in_transit',
  outfordelivery:       'out_for_delivery',
  attemptfail:          'in_transit',
  delivered:            'delivered',
  availableforpickup:   'in_packstation',
  exception:            'in_transit',
  expired:              'unknown',
};

const AS_SUBTAG_MAP: Record<string, InternalTrackingStatus> = {
  inforeceived001:      'info_received',
  intransit001:         'in_transit',
  intransit002:         'in_transit',
  intransit003:         'in_transit',
  intransit004:         'in_transit',
  intransit005:         'in_transit',
  intransit006:         'in_transit',
  intransit007:         'in_transit',
  outfordelivery001:    'out_for_delivery',
  availableforpickup001: 'in_packstation',
  delivered001:         'delivered',
  delivered002:         'delivered',
  delivered003:         'delivered',
  delivered004:         'delivered',
  attemptfail001:       'in_transit',
  attemptfail002:       'in_transit',
  attemptfail003:       'in_transit',
  exception004:         'in_transit',
  exception005:         'in_transit',
  exception006:         'in_transit',
  exception007:         'in_transit',
  exception008:         'in_transit',
  exception009:         'in_transit',
  exception010:         'delivered',
  exception011:         'in_transit',
  pending001:           'unknown',
  expired001:           'unknown',
};

// ─── SDK-Instanz ────────────────────────────────────────────────────────────────

type AsSdk = AfterShip;

let _sdk: AsSdk | null = null;

const AS_LOG_PREFIX = '[AfterShip API]';
const AS_LOG_BODY_MAX = 12_000;

function asLogEnabled(): boolean {
  const flag = process.env.AFTERSHIP_DEBUG_LOG?.trim().toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

function asSafeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function asTruncate(text: string, max = AS_LOG_BODY_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (${text.length - max} weitere Zeichen gekürzt)`;
}

function asLogRequest(method: string, endpoint: string, payload?: unknown): void {
  if (!asLogEnabled()) return;
  console.log(`${AS_LOG_PREFIX} → ${method} ${endpoint}`);
  if (payload !== undefined) {
    console.log(`${AS_LOG_PREFIX}   Anfrage:\n${asTruncate(asSafeJson(payload))}`);
  }
}

function asLogResponse(endpoint: string, status: string, body: unknown, extra?: string): void {
  if (!asLogEnabled()) return;
  const suffix = extra ? ` (${extra})` : '';
  console.log(`${AS_LOG_PREFIX} ← ${endpoint} [${status}]${suffix}`);
  console.log(`${AS_LOG_PREFIX}   Antwort:\n${asTruncate(asSafeJson(body))}`);
}

function getSdk(): AsSdk {
  if (!_sdk) {
    const key = process.env.AFTERSHIP_API_KEY?.trim();
    if (!key) {
      throw new TrackingProviderError('aftership', 'auth', 'AFTERSHIP_API_KEY fehlt in .env');
    }
    _sdk = new AfterShip({
      api_key: key,
      timeout: Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 12000),
    });
  }
  return _sdk;
}

function normalizeStatusKey(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function mapStatus(raw: string | undefined): InternalTrackingStatus {
  if (!raw) return 'unknown';
  const key = normalizeStatusKey(raw);
  if (AS_SUBTAG_MAP[key]) return AS_SUBTAG_MAP[key];
  return AS_TAG_MAP[key] ?? 'unknown';
}

function asUserMessage(err: AftershipError): string {
  switch (err.code) {
    case AfterShipErrorCodes.TOO_MANY_REQUEST:
    case AfterShipErrorCodes.RATE_LIMIT_EXCEED:
      return 'AfterShip Rate-Limit erreicht – bitte kurz warten und erneut versuchen.';
    case AfterShipErrorCodes.API_KEY_INVALID:
    case AfterShipErrorCodes.INVALID_API_KEY:
    case AfterShipErrorCodes.REQUEST_NOT_ALLOWED:
      return 'AfterShip API-Key ungültig – Zugangsdaten unter https://organization.automizely.com/api-keys prüfen.';
    case AfterShipErrorCodes.TRACKING_DOES_NOT_EXIST:
    case AfterShipErrorCodes.NOT_FOUND:
      return 'Sendung bei AfterShip nicht gefunden.';
    case AfterShipErrorCodes.BAD_COURIER:
      return 'AfterShip konnte keinen Carrier für diese Sendungsnummer erkennen.';
    default:
      return err.message || `AfterShip-Fehler (Code ${err.meta_code ?? 'unbekannt'})`;
  }
}

function isQuotaError(err: AftershipError): boolean {
  return err.code === AfterShipErrorCodes.TOO_MANY_REQUEST
    || err.code === AfterShipErrorCodes.RATE_LIMIT_EXCEED;
}

function isAuthError(err: AftershipError): boolean {
  return err.code === AfterShipErrorCodes.API_KEY_INVALID
    || err.code === AfterShipErrorCodes.INVALID_API_KEY
    || err.code === AfterShipErrorCodes.REQUEST_NOT_ALLOWED;
}

function isNotFoundError(err: AftershipError): boolean {
  return err.code === AfterShipErrorCodes.TRACKING_DOES_NOT_EXIST
    || err.code === AfterShipErrorCodes.NOT_FOUND;
}

function isAlreadyExistsError(err: unknown): boolean {
  return err instanceof AftershipError
    && err.code === AfterShipErrorCodes.TRACKING_ALREADY_EXIST;
}

async function detectCourierSlug(
  sdk: AsSdk,
  trackingNumber: string,
): Promise<{ slug: string; name: string } | null> {
  const payload = { tracking_number: trackingNumber };
  try {
    asLogRequest('POST', '/couriers/detect', payload);
    const detected = await sdk.courier.detectCourier(payload);
    asLogResponse('/couriers/detect', 'ok', detected);
    const couriers = detected.data?.couriers ?? [];
    if (couriers.length > 0 && couriers[0].slug) {
      const { slug, name } = couriers[0];
      console.log(`[AfterShip] Erkannt: ${slug} (${name ?? slug})`);
      return { slug, name: name ?? slug };
    }
  } catch (err) {
    console.warn('[AfterShip] Carrier-Erkennung fehlgeschlagen:', err);
    if (asLogEnabled()) {
      console.warn(`${AS_LOG_PREFIX}   Fehler couriers/detect:`, err);
    }
  }
  return null;
}

interface AsTrackingItem {
  id?: string;
  tracking_number?: string;
  slug?: string;
  tag?: string;
  subtag?: string;
  subtag_message?: string;
  checkpoints?: Array<{
    checkpoint_time?: string;
    location?: string | null;
    city?: string | null;
    country_region_name?: string | null;
    message?: string;
    tag?: string;
    subtag?: string;
    subtag_message?: string;
  }>;
  courier_estimated_delivery_date?: {
    estimated_delivery_date?: string | null;
    estimated_delivery_date_min?: string | null;
    estimated_delivery_date_max?: string | null;
  } | null;
  latest_estimated_delivery?: {
    datetime?: string | null;
  } | null;
}

async function getTrackingData(
  sdk: AsSdk,
  trackingNumber: string,
  slug: string,
): Promise<AsTrackingItem | null> {
  const query = { tracking_numbers: trackingNumber, slug };
  asLogRequest('GET', '/trackings', query);
  const result = await sdk.tracking.getTrackings(query);
  asLogResponse('/trackings', 'ok', result);
  return result.data?.trackings?.[0] ?? null;
}

function buildTrackingResult(
  tracking: AsTrackingItem,
  trackingNumber: string,
  slug: string,
  detected: { slug: string; name: string } | null,
): TrackingResult {
  const tagRaw = tracking.tag ?? '';
  let internalStatus = mapStatus(tracking.subtag ?? tagRaw);
  const latestMessage = tracking.subtag_message ?? '';
  if (detectPackstationFromDescription(latestMessage)) internalStatus = 'in_packstation';

  const checkpointRows = [...(tracking.checkpoints ?? [])].sort(
    (a, b) => new Date(b.checkpoint_time ?? 0).getTime() - new Date(a.checkpoint_time ?? 0).getTime(),
  );

  let rawEvents = checkpointRows.flatMap((cp) => {
    if (!cp.checkpoint_time) return [];
    const ts = new Date(cp.checkpoint_time);
    if (isNaN(ts.getTime())) return [];
    const desc = cp.message || cp.subtag_message || 'Status-Update';
    let evInternal = mapStatus(cp.subtag ?? cp.tag);
    if (detectPackstationFromDescription(desc)) evInternal = 'in_packstation';
    const location =
      [cp.city, cp.country_region_name].filter(Boolean).join(', ')
      || cp.location || '';

    return [{
      timestamp:   ts,
      location,
      status:      internalStatusToDb(evInternal),
      description: desc,
    }];
  });

  if (rawEvents.length === 0) {
    rawEvents.push({
      timestamp:   new Date(),
      location:    '',
      status:      internalStatusToDb(internalStatus),
      description: latestMessage || tagRaw || 'Status-Update',
    });
  }

  const events = dedupeEvents(rawEvents).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );

  let estimatedDelivery: Date | undefined;
  const etaRaw =
    tracking.courier_estimated_delivery_date?.estimated_delivery_date
    ?? tracking.courier_estimated_delivery_date?.estimated_delivery_date_max
    ?? tracking.latest_estimated_delivery?.datetime;
  if (etaRaw) {
    const d = new Date(etaRaw);
    if (!isNaN(d.getTime())) estimatedDelivery = d;
  }

  return {
    provider:        `aftership/${slug}`,
    internalStatus,
    status:          internalStatusToDb(internalStatus),
    events,
    estimatedDelivery,
    detectedCarrier: detected?.name,
    courierCode:     slug,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class AfterShipProvider implements TrackingProvider {
  readonly providerName = 'aftership';
  readonly carrierKeys: string[] = Object.keys(CARRIER_SLUG_MAP);

  isConfigured(): boolean {
    return Boolean(process.env.AFTERSHIP_API_KEY?.trim());
  }

  async fetchTracking(trackingNumber: string): Promise<TrackingResult> {
    if (!this.isConfigured()) {
      throw new TrackingProviderError(this.providerName, 'auth', 'AFTERSHIP_API_KEY fehlt in .env');
    }

    const sdk = getSdk();

    if (asLogEnabled()) {
      console.log(`${AS_LOG_PREFIX} ══ Tracking-Abfrage: ${trackingNumber} ══`);
    }

    const detected = await detectCourierSlug(sdk, trackingNumber);
    const slug = detected?.slug ?? null;

    if (!slug) {
      throw new TrackingProviderError(
        this.providerName, 'not_found',
        `Carrier für Sendungsnummer ${trackingNumber} konnte nicht ermittelt werden`,
      );
    }

    let createResult: AsTrackingItem | null = null;
    let lastError: TrackingProviderError | null = null;
    const createPayload = { tracking_number: trackingNumber, slug };

    try {
      asLogRequest('POST', '/trackings', createPayload);
      const created = await sdk.tracking.createTracking(createPayload);
      asLogResponse('/trackings', 'ok', created);
      createResult = created.data ?? null;
    } catch (err) {
      if (!isAlreadyExistsError(err)) {
        if (err instanceof AftershipError) {
          if (isQuotaError(err)) lastError = new TrackingProviderError('aftership', 'rate_limit', asUserMessage(err), true);
          else if (isAuthError(err)) lastError = new TrackingProviderError('aftership', 'auth', asUserMessage(err));
        }
        console.warn('[AfterShip] createTracking Fehler (ignoriert):', err);
        if (asLogEnabled()) {
          console.warn(`${AS_LOG_PREFIX}   Fehler trackings/create:`, err);
        }
      }
    }

    let trackingItem: AsTrackingItem | null = null;
    try {
      trackingItem = await getTrackingData(sdk, trackingNumber, slug);
    } catch (err) {
      if (err instanceof AftershipError) {
        if (isQuotaError(err)) lastError = new TrackingProviderError('aftership', 'rate_limit', asUserMessage(err), true);
        else if (isAuthError(err)) lastError = new TrackingProviderError('aftership', 'auth', asUserMessage(err));
      }
      console.warn('[AfterShip] getTrackings:', err);
    }

    if (!trackingItem && createResult) {
      trackingItem = createResult;
    }

    if (!trackingItem) {
      if (lastError) throw lastError;
      throw new TrackingProviderError(
        this.providerName,
        'not_found',
        `Keine Tracking-Daten für Sendung ${trackingNumber} (${slug}).`,
      );
    }

    return buildTrackingResult(trackingItem, trackingNumber, slug, detected);
  }
}

// ─── Tracking bei AfterShip entfernen (Bestellung bleibt lokal) ─────────────────

function resolveSlugFromCarrier(carrier: string | null | undefined): string | null {
  if (!carrier?.trim()) return null;
  const key = carrier.trim().toLowerCase();
  return CARRIER_SLUG_MAP[key] ?? null;
}

/**
 * Entfernt eine Sendung aus dem AfterShip-Konto (DELETE by ID).
 * Lokale Bestellungen und Tracking-Events werden nicht gelöscht.
 * Fehler werden geloggt, werfen aber keine Exception (idempotent).
 */
export async function deleteTrackingFromAfterShip(
  trackingNumber: string,
  options: { courierCode?: string | null; carrier?: string | null } = {},
): Promise<void> {
  if (!process.env.AFTERSHIP_API_KEY?.trim()) return;

  const tn = trackingNumber?.trim();
  if (!tn) return;

  let slug =
    options.courierCode?.trim()
    || resolveSlugFromCarrier(options.carrier)
    || null;

  const sdk = getSdk();

  if (!slug) {
    const detected = await detectCourierSlug(sdk, tn);
    slug = detected?.slug ?? null;
  }

  if (!slug) {
    console.warn(`[AfterShip] Löschen übersprungen – kein Carrier für ${tn}`);
    return;
  }

  let asId: string | null = null;
  try {
    const item = await getTrackingData(sdk, tn, slug);
    asId = item?.id ?? null;
  } catch (err) {
    console.warn('[AfterShip] GET vor Löschen fehlgeschlagen:', (err as Error).message);
  }

  if (!asId) {
    console.log(`[AfterShip] Nichts zu löschen (keine AfterShip-ID) für ${tn}`);
    return;
  }

  try {
    asLogRequest('DELETE', `/trackings/${asId}`);
    const result = await sdk.tracking.deleteTrackingById(asId);
    asLogResponse(`/trackings/${asId}`, 'ok', result);
    console.log(`[AfterShip] Sendung ${tn} aus AfterShip entfernt`);
  } catch (err) {
    if (err instanceof AftershipError && isNotFoundError(err)) {
      console.log(`[AfterShip] Sendung ${tn} war bereits entfernt`);
      return;
    }
    console.warn('[AfterShip] deleteTrackingById fehlgeschlagen:', (err as Error).message);
  }
}
