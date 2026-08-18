import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss(),],
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
