import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/paketdienst/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5177,
    proxy: {
      // Fallback, falls Requests doch relativ über :5177 laufen (z. B. ältere Builds)
      '^/paketdienst/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
        rewrite: (p) => p.replace(/^\/paketdienst\/api/, '/api'),
      },
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
});
