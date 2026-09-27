import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: apiProxy(),
  preview: apiProxy(),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})

function apiProxy() {
  return {
    proxy: {
      '/api/account': {
        target: process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/account/, ''),
      },
      '/api/venue': {
        target: process.env.VENUE_BOOKING_SERVICE_URL ?? 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/venue/, ''),
      },
      '/api/finance': {
        target: process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/finance/, ''),
      },
      '/api/matchmaking': {
        target: process.env.MATCHMAKING_SERVICE_URL ?? 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/matchmaking/, ''),
      },
      '/api/community': {
        target: process.env.COMMUNITY_SERVICE_URL ?? 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/community/, ''),
      },
      '/socket.io': {
        target: process.env.MATCHMAKING_SERVICE_URL ?? 'http://localhost:3004',
        changeOrigin: true,
        ws: true,
      },
    },
  }
}
