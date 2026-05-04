/**
 * Öffentliche Basis-URL der SPA — gleicher Wert wie FRONTEND_URL im Backend, im Frontend als VITE_FRONTEND_URL (.env).
 * Ermöglicht korrektes Routing unter Unterpfaden (vite `base`).
 */
export function routerBasename(): string | undefined {
  const raw = import.meta.env.VITE_FRONTEND_URL?.trim();
  if (raw) {
    try {
      const { pathname } = new URL(raw);
      const normalized = pathname.replace(/\/+$/, '');
      return normalized === '' ? undefined : normalized;
    } catch {
      /* VITE_FRONTEND_URL ungültig — Fallback auf vite base */
    }
  }
  const base = import.meta.env.BASE_URL || '/';
  const normalized = base.replace(/\/+$/, '');
  return normalized === '' || normalized === '/' ? undefined : normalized;
}

/** Volle URL für Reload/Redirect (axios-Interceptor hat kein Router-Kontext). */
export function resolveFrontendPublicUrl(path: string): string {
  const rel = path.startsWith('/') ? path : `/${path}`;
  const configured = import.meta.env.VITE_FRONTEND_URL?.trim();
  if (configured) {
    const root = configured.replace(/\/+$/, '');
    return `${root}${rel}`;
  }
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${origin}${basePath}${rel}`;
}
