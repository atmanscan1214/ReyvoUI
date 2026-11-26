import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies /api to the local FastAPI app so the browser never
// has to deal with CORS. Override the target with VITE_API_PROXY_TARGET, or
// point the built app at a full URL with VITE_API_URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        // Health probes live outside /api/v1; the status page reads them directly.
        '/health': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
