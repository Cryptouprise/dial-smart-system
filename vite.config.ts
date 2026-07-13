import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'AI Dial Boss - Smart Dialer',
        short_name: 'AI Dial Boss',
        description: 'AI-powered smart dialing system for efficient call management',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB limit
        // Precache ONLY the SPA app shell — not the ~280 pre-rendered SEO/
        // showcase/blog HTML pages and their images. Those are standalone static
        // pages served directly (and crawled); precaching them forced a ~43MB
        // service-worker download on every first app visit. The app at / only
        // needs its own JS/CSS/fonts + root shell for offline/PWA.
        globPatterns: [
          'assets/**/*.{js,css,woff2}',
          'index.html',
          'manifest.webmanifest',
          'favicon.ico',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'apple-touch-icon.png',
        ],
        globIgnores: ['**/showcase/**', '**/blog*/**', '**/templates/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules\/(?:react|react-dom|react-router-dom)\//,
            },
            {
              name: 'vendor-ui',
              test: /node_modules\/@radix-ui\/react-(?:dialog|dropdown-menu|select|tabs|toast|slot|label)\//,
            },
            { name: 'vendor-charts', test: /node_modules\/recharts\// },
            {
              name: 'vendor-forms',
              test: /node_modules\/(?:react-hook-form|@hookform\/resolvers|zod)\//,
            },
            {
              name: 'vendor-data',
              test: /node_modules\/(?:@tanstack\/react-query|@supabase\/supabase-js)\//,
            },
          ],
        },
        minify: mode === 'production' ? {
          compress: {
            dropDebugger: true,
            treeshake: {
              manualPureFunctions: [
                'console.log',
                'console.debug',
                'console.info',
              ],
            },
          },
        } : undefined,
      },
    },
    chunkSizeWarningLimit: 600,
    sourcemap: mode === 'development',
  },
}));
