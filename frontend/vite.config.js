import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Request flow (no CORS issues because proxy is server-side):
 *
 *  Browser  →  Vite (localhost:3000)  →  Spring Boot (localhost:8080)
 *
 *  Browser sends:  POST http://localhost:3000/api/auth/user/login
 *  Vite proxies:   POST http://localhost:8080/api/auth/user/login
 *  Spring sees:         /auth/user/login  (after stripping context-path /api)
 *
 *  The browser NEVER talks directly to port 8080,
 *  so CORS is irrelevant for proxied requests.
 *  The backend CORS config only matters for direct API consumers.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,   // allow fallback to next port if 3000 is taken
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[proxy error]', err.message);
          });
        },
      },
      '/socket.io': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => '/api' + path,
      },
    },
  },
});
