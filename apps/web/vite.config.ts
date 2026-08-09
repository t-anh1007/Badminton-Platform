import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: apiProxy(),
  preview: apiProxy(),
})

function apiProxy() {
  return {
    proxy: {
      '/api/account': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/account/, ''),
      },
      '/api/venue': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/venue/, ''),
      },
      '/api/finance': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/finance/, ''),
      },
      '/api/matchmaking': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/matchmaking/, ''),
      },
      '/api/community': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/community/, ''),
      },
      '/socket.io': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        ws: true,
      },
    },
  }
}
