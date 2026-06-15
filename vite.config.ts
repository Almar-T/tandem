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
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Tandem',
        short_name: 'Tandem',
        description: 'A shared AI-powered productivity OS for two.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
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
