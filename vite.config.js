import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev: `npm run sarthi` serves these. If it is not running, Sarthi falls back to scripted mode.
    proxy: {
      '/api/sarthi-chat': { target: 'http://localhost:3001', changeOrigin: true },
      '/api/sarthi-vision': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
