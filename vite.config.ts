import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { cloudflare } from "@cloudflare/vite-plugin"
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode, ssrBuild }) => {
  // ssrBuild is true for server-side builds (including some worker builds)
  const isClientBuild = !ssrBuild

  return {
    plugins: [
      react(),
      // Cloudflare plugin: keep, but be mindful of ordering if you still see issues
      cloudflare({
        proxy: {
          '/api': 'http://localhost:8788',
        },
      }),
      // Only add the PWA plugin during the client build (avoid during SSR/worker build)
      ...(isClientBuild
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-512x512.png'],
              manifest: {
                name: 'SuiteWaste OS',
                short_name: 'SuiteWaste',
                description:
                  'A desktop-style PWA for the waste management sector, featuring a multi-window OS interface and AI-powered workflow applications.',
                theme_color: '#2E7D32',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: '/',
                icons: [
                  { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
                runtimeCaching: [
                  {
                    urlPattern: /^\/api\//,
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'api-cache',
                      expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 * 60 },
                    },
                  },
                ],
              },
              strategies: 'generateSW',
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8788',
          changeOrigin: true,
          secure: false,
          ws: true,
          // dev caching options are fine here; not relevant to build
        },
      },
    },
    build: {
      ssr: false,
    },
  }
})
