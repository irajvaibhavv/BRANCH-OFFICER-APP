import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Sarthi's Gemini calls go to /api/sarthi-* — in production Vercel serves api/, in dev the
    // local proxy (`npm run sarthi`) does. If the proxy is not running the app falls back to
    // scripted demo mode, so a failure here is not fatal.
    proxy: {
      '/api/sarthi-chat': { target: 'http://localhost:3001', changeOrigin: true },
      '/api/sarthi-vision': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
