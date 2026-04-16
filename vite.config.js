import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Production builds use a relative base so the same `dist/` works on GitHub Pages
 * (`/<repo>/`) and at the domain root, without setting VITE_BASE_PATH in CI.
 * Dev server keeps `/` so paths match the Vite dev URL.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
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
}))
