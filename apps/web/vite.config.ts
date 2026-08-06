import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: venueProxy(),
  preview: venueProxy(),
})

function venueProxy() {
  return {
    proxy: {
      '/api/venue': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/venue/, ''),
      },
    },
  }
}
