import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'

// Ships the built page as dist/app.html instead of dist/index.html.
//
// Vercel serves a static file before it consults rewrites, so while
// dist/index.html existed "/" could never reach api/render.js — the homepage
// would stay an empty shell to crawlers. With no index.html, "/" falls through
// to the rewrite; every other SPA route rewrites to /app.html directly. A
// plain file rename after the bundle is written — no prerender, no browser.
const shellAsAppHtml = () => {
  let outDir
  return {
    name: 'shell-as-app-html',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      await rename(resolve(outDir, 'index.html'), resolve(outDir, 'app.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), shellAsAppHtml()],
  build: {
    rollupOptions: {
      output: {
        // React and the router change far less often than app code, so giving
        // them their own chunk lets returning visitors reuse it across deploys
        // instead of re-downloading it inside every new entry hash.
        //
        // Matched by path rather than by package name: the bare-name form only
        // catches each package's entry module, leaving react-dom's actual
        // implementation files — the bulk of it — back in the entry chunk.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
