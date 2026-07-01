import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, rmSync } from 'fs';

// ── Plugin: wipe the Vite dep-cache on every cold start ──────────────────────
// This prevents ERR_CACHE_READ_FAILURE errors that occur after PC power-on,
// where OneDrive sync or Windows fast-startup can leave the cache in a broken
// state. Re-bundling deps takes ~2–3 s but is always reliable.
function clearViteCache() {
  return {
    name: 'clear-vite-cache',
    // configureServer fires on `vite dev` — this is the important hook
    configureServer() {
      const cacheDir = path.resolve(__dirname, 'node_modules/.vite');
      if (existsSync(cacheDir)) {
        try {
          rmSync(cacheDir, { recursive: true, force: true });
          console.log('[JARVIS] Vite dep-cache cleared — fresh bundle starting.');
        } catch (e) {
          console.warn('[JARVIS] Could not clear cache (non-fatal):', e.message);
        }
      }
    },
    // Also clear on production build
    buildStart() {
      const cacheDir = path.resolve(__dirname, 'node_modules/.vite');
      if (existsSync(cacheDir)) {
        try {
          rmSync(cacheDir, { recursive: true, force: true });
        } catch (e) {
          console.warn('[JARVIS] Could not clear cache (non-fatal):', e.message);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [clearViteCache(), react()],
  server: {
    port: 5173,
    host: true,
    // Prevent Vite from auto-opening Chrome (causes duplicate tabs alongside Electron)
    open: false,
    // Prevent OneDrive from locking dep cache chunks
    fs: { strict: false },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // Keep optimized deps cache outside OneDrive where possible
  cacheDir: 'node_modules/.vite',
});

