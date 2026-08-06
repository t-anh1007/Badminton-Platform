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
    },
  }
}
