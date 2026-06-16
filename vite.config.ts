import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// GitHub Pages serves the app from /tandem/ — keep base in sync with the repo name.
const BASE = '/tandem/'

export default defineConfig({
  base: BASE,
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Tandem',
        short_name: 'Tandem',
        description: 'A shared AI-powered productivity OS for two.',
        theme_color: '#1b2a1e',
        background_color: '#f9f7f2',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Pull in our push/notificationclick handlers (served from public/).
        importScripts: ['/tandem/push-sw.js'],
        navigateFallbackDenylist: [/^\/auth/],
        runtimeCaching: [
          {
            // Cache the app shell; Supabase data is handled by TanStack Query, not the SW.
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: { cacheName: 'tandem-shell' },
          },
        ],
      },
    }),
  ],
})
