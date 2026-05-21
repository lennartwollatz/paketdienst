/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gleiche öffentliche App-URL wie FRONTEND_URL im Backend (z. B. https://host/paketdienst). */
  readonly VITE_FRONTEND_URL: string | undefined;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_API_URL: string | undefined;
  readonly VITE_BACKEND_PORT: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
