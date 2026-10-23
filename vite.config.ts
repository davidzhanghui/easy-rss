import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Build id stamped into the app + service worker so every deploy rotates the
// SW cache name; stale app-shell/assets are then purged in `activate`.
const BUILD_ID = String(Date.now())
const replaceBuildId = (text: string) => text.replaceAll('__BUILD_ID__', BUILD_ID)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'inject-build-id',
      transformIndexHtml(html) {
        return replaceBuildId(html)
      },
      closeBundle() {
        // public/ is copied verbatim, so patch the emitted sw.js on disk.
        const swPath = resolve(__dirname, 'dist/sw.js')
        try {
          const src = readFileSync(swPath, 'utf8')
          if (src.includes('__BUILD_ID__')) writeFileSync(swPath, replaceBuildId(src))
        } catch {
          // dev / no build output — nothing to patch
        }
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 3100,
    host: true,
  },
  preview: {
    port: 4173,
  },
})
