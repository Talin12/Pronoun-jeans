import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { entityGraph } from './src/content/schemaBuilders.js'

// Writes the site-wide Organization + LocalBusiness JSON-LD into index.html.
//
// index.html is a static file and cannot import anything, so the business
// name, address, phone and opening hours used to be typed into it a third
// time — and the hours in it were already a different pair of numbers from
// the ones on /contact. The markup is now built from BUSINESS at build time,
// which leaves exactly one copy of those facts in the repo.
const ENTITY_PLACEHOLDER = '<!--entity-jsonld-->'

const entityJsonLd = () => ({
  name: 'entity-jsonld',
  transformIndexHtml(html) {
    if (!html.includes(ENTITY_PLACEHOLDER)) {
      // Failing the build is the point: silently shipping a shell with no
      // entity markup would cost the site its Knowledge Panel and nobody
      // would notice for weeks.
      throw new Error(`index.html is missing ${ENTITY_PLACEHOLDER} — refusing to build a shell with no entity JSON-LD`)
    }
    const siteUrl = (process.env.VITE_SITE_URL || 'https://www.pronounjeans.com')
      .trim()
      .replace(/\/+$/, '')
    const json = JSON.stringify(entityGraph(siteUrl), null, 2).replace(/</g, '\\u003c')
    return html.replace(
      ENTITY_PLACEHOLDER,
      `<script type="application/ld+json">\n${json}\n    </script>`,
    )
  },
})

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
  plugins: [react(), tailwindcss(), entityJsonLd(), shellAsAppHtml()],
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
