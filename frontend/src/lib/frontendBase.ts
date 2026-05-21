/**
 * Öffentliche Basis der SPA (VITE_FRONTEND_URL ≙ FRONTEND_URL im Backend, plus vite `base`).
 * Enthält Pfad-Ergänzung: steht in VITE_FRONTEND_URL nur die Domain ohne Unterpfad,
 * wird import.meta.env.BASE_URL (z. B. /paketdienst) für Router, Redirects und API-Pfad genutzt.
 */

/** Unterpfad der SPA, z. B. „/paketdienst“. undefined = App an Domain-Root. */
export function spaPathPrefix(): string | undefined {
  const raw = import.meta.env.VITE_FRONTEND_URL?.trim();

  if (raw) {
    try {
      const p = new URL(raw).pathname.replace(/\/+$/, '');
      if (p !== '') {
        return p.startsWith('/') ? p : `/${p}`;
      }
    } catch {
      /* ungültige URL → Fallback BASE_URL */
    }
  }

  const b = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return b === '' || b === '/' ? undefined : b.startsWith('/') ? b : `/${b}`;
}

function spaOrigin(): string {
  const raw = import.meta.env.VITE_FRONTEND_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* */
    }
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function routerBasename(): string | undefined {
  return spaPathPrefix();
}

/** Volle URL für Reload/Redirect (z. B. axios-Interceptor ohne Router). */
export function resolveFrontendPublicUrl(path: string): string {
  const rel = path.startsWith('/') ? path : `/${path}`;
  const prefix = spaPathPrefix() ?? '';
  return `${spaOrigin()}${prefix}${rel}`;
}

/**
 * Axios baseURL:
 * - VITE_API_URL gesetzt → exakt diese URL (z. B. http://localhost:3003/api)
 * - Development ohne VITE_API_URL → direkt Backend (VITE_BACKEND_PORT, Standard 3003),
 *   damit lange Requests (Tracking-Refresh) nicht am Vite-Proxy auf :5177 hängen bleiben
 * - Production → relativer Pfad „{spaPrefix}/api“
 */
export function resolveApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_BACKEND_PORT?.trim() || '3003';
    return `http://localhost:${port}/api`;
  }

  const prefix = spaPathPrefix();
  if (prefix) {
    return `${prefix}/api`;
  }
  return '/api';
}
