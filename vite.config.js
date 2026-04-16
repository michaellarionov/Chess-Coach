import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** GitHub project pages live under /<repo>/; set VITE_BASE_PATH in CI (e.g. /Chess-Coach/). */
function appBase() {
  const raw = process.env.VITE_BASE_PATH?.trim()
  if (!raw || raw === '/') return '/'
  const withSlash = raw.endsWith('/') ? raw : `${raw}/`
  return withSlash.startsWith('/') ? withSlash : `/${withSlash}`
}

export default defineConfig({
  base: appBase(),
  plugins: [react()],
  optimizeDeps: {
    exclude: ['stockfish'],
  },
  server: {
    headers: {
      // Optional: enables threaded Stockfish if you swap builds; safe with lite-single too
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/anthropic/, '/v1'),
      },
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
