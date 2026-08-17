/* Paketdienst Service Worker — Web Push Empfang & Klick-Handling */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Paketdienst', body: 'Du hast eine neue Benachrichtigung.' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: 'icon-192.svg',
    badge: 'icon-192.svg',
    tag: payload.tag,
    data: { url: payload.url, ...(payload.data || {}) },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

/**
 * Push-Payloads liefern App-Pfade wie `/orders/:id`. Mit führendem Slash würde
 * `new URL('/orders/…', scope)` den SPA-Unterpfad (z. B. /paketdienst) verlieren.
 */
function resolveNotificationUrl(targetPath, scope) {
  const scopeUrl = new URL(scope);

  if (!targetPath || targetPath === '/') {
    return scopeUrl.href;
  }

  if (/^https?:\/\//i.test(targetPath)) {
    return targetPath;
  }

  const scopePath = scopeUrl.pathname.replace(/\/+$/, '');
  const path = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;

  if (scopePath && (path === scopePath || path.startsWith(`${scopePath}/`))) {
    return `${scopeUrl.origin}${path}`;
  }

  const relative = path.startsWith('/') ? path.slice(1) : path;
  return new URL(relative, scope).href;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const targetUrl = resolveNotificationUrl(targetPath, self.registration.scope);

    for (const client of allClients) {
      if ('focus' in client) {
        try {
          await client.focus();
          if ('navigate' in client && client.url !== targetUrl) {
            await client.navigate(targetUrl);
          }
          return;
        } catch (e) {
          /* ignorieren – Fallback unten */
        }
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
