import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `npm run build:file`: Chrome blocks <script type="module" src> on file://, so JS and CSS are inlined into index.html.
const inlineIntoHtml = {
  name: 'inline-into-html',
  enforce: 'post',
  generateBundle(_, bundle) {
    const page = bundle['index.html']
    let html = page.source
    for (const [name, out] of Object.entries(bundle)) {
      if (name.endsWith('.js')) {
        html = html.replace(new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`),
          () => `<script type="module">${out.code.replaceAll('</script', '<\\/script')}</script>`)
        delete bundle[name]
      } else if (name.endsWith('.css')) {
        html = html.replace(new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`), () => `<style>${out.source}</style>`)
        delete bundle[name]
      }
    }
    page.source = html
  },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === 'file' && inlineIntoHtml],
  ...(mode === 'file' && {
    base: './',
    build: { outDir: 'dist-file', assetsInlineLimit: Infinity, rollupOptions: { output: { inlineDynamicImports: true } } },
  }),
  server: {
    // Dev: `npm run sarthi` serves these. If it is not running, Sarthi falls back to scripted mode.
    proxy: {
      '/api/sarthi-chat': { target: 'http://localhost:3001', changeOrigin: true },
      '/api/sarthi-vision': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
}))
