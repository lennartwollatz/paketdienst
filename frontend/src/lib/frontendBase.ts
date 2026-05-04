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
 * Axios baseURL: VITE_API_URL (absolut, z. B. http://localhost:3001) falls gesetzt,
 * sonst gleicher Host + Pfad wie die SPA: „{spaPrefix}/api“ oder „/api“ an der Root.
 */
export function resolveApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const prefix = spaPathPrefix();
  if (prefix) {
    return `${prefix}/api`;
  }
  return '/api';
}
