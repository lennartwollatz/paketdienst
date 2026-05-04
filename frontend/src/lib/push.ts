import { pushApi } from '../api/push';
import { spaPathPrefix } from './frontendBase';

/**
 * Frontend-Helfer für Web Push.
 * - registerServiceWorker(): registriert /sw.js mit korrektem Scope
 * - subscribeToPush(): fragt Berechtigung an, erzeugt Subscription, schickt sie ans Backend
 * - unsubscribeFromPush(): entfernt Subscription lokal & im Backend
 * - getPushStatus(): aktueller Zustand für die UI
 */

export type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface PushStatus {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Pfad-Präfix für Service-Worker-/Manifest-Auslieferung (z. B. "/paketdienst/"). */
function scopePath(): string {
  const prefix = spaPathPrefix() ?? '';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  const scope = scopePath() || '/';
  try {
    const existing = await navigator.serviceWorker.getRegistration(scope);
    if (existing) return existing;
    return await navigator.serviceWorker.register(`${scope}sw.js`, { scope });
  } catch (err) {
    console.error('[push] Service Worker Registrierung fehlgeschlagen:', err);
    return null;
  }
}

/** Wandelt einen Base64-URL-Public-Key in einen ArrayBuffer (für PushManager.subscribe). */
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }

  const permission = Notification.permission as PushPermission;
  const reg = await navigator.serviceWorker.getRegistration(scopePath() || '/');
  const subscription = await reg?.pushManager.getSubscription();
  return { supported: true, permission, subscribed: !!subscription };
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Dieser Browser unterstützt keine Push-Benachrichtigungen.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Berechtigung für Benachrichtigungen wurde nicht erteilt.');
  }

  const reg = await registerServiceWorker();
  if (!reg) throw new Error('Service Worker konnte nicht registriert werden.');

  // Vor dem Subscribe sicherstellen, dass der SW aktiv ist.
  if (!reg.active) {
    await new Promise<void>((resolve) => {
      const sw = reg.installing || reg.waiting;
      if (!sw) return resolve();
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve();
      });
    });
  }

  const { data } = await pushApi.publicKey();
  const applicationServerKey = urlBase64ToBuffer(data.publicKey);

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'));
  const auth = arrayBufferToBase64(subscription.getKey('auth'));

  await pushApi.subscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh, auth },
    userAgent: navigator.userAgent,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(scopePath() || '/');
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  await pushApi.unsubscribe(endpoint).catch(() => undefined);
}
