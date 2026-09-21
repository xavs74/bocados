import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // `npx wrangler dev` serves the Worker (the Open Food Facts API) on 8788.
  server: {
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The barcode reader is ~1 MB; it loads when scanning starts instead of on install.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'] },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bocados',
        short_name: 'Bocados',
        description: 'Apunta lo que comes y mira tus calorías y macros frente a tus objetivos.',
        lang: 'es',
        theme_color: '#a9492a',
        background_color: '#f6efe3',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
