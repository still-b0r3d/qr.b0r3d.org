import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { VitePWA } from 'vite-plugin-pwa'

// Shown in the footer. The version is Mini QR's plus b0r3d's own release
// count (see README, Versioning); the build is the commit it was built from,
// which the hosting build passes in and a local build asks git for.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

function buildCommit() {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, '.', '')
  // Get BASE_PATH from environment variable, default to './' for relative paths
  // Using './' ensures the app works when deployed at any sub-path without configuration
  // Ensure base path ends with slash for proper URL construction
  let base = env.BASE_PATH || './'
  if (!base.endsWith('/')) {
    base = base + '/'
  }

  return {
    base,
    define: {
      // Make BASE_PATH available to client-side code through import.meta.env
      'import.meta.env.BASE_PATH': JSON.stringify(base),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
      'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(buildCommit())
    },
    plugins: [
      vue(),
      vueJsx(),
      VitePWA({
        registerType: 'autoUpdate',
        base: base, // Make sure PWA respects the base path
        includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
        manifest: {
          name: 'b0r3d QR',
          short_name: 'b0r3d QR',
          description: 'Static QR code generator and scanner. Codes never expire.',
          theme_color: '#131313',
          background_color: '#131313',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base, // Use the base path as start URL
          icons: [
            {
              src: 'app_icons/web/icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'app_icons/web/icon-192-maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: 'app_icons/web/icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'app_icons/web/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          screenshots: [
            {
              src: 'app_icons/web/screenshot-narrow.png',
              sizes: '780x1688',
              type: 'image/png',
              form_factor: 'narrow'
            },
            {
              src: 'app_icons/web/screenshot-wide.png',
              sizes: '1440x900',
              type: 'image/png',
              form_factor: 'wide'
            }
          ]
        },
        workbox: {
          // Removed html from patterns. Fonts are left out on purpose: the
          // self-hosted frame fonts are only fetched when someone picks one,
          // and are cached at that point by the 'fonts' rule below.
          globPatterns: ['**/*.{js,css,svg,png,jpg,jpeg,gif,ico}'],
          // Exclude HTML files to avoid base path issues. iOS start-up
          // images, install-prompt screenshots and the share preview image are
          // only fetched by the OS or by link previews, never by the app.
          globIgnores: [
            '**/app_icons/web/splash-*',
            '**/app_icons/web/screenshot-*',
            'og-image.png',
            '**/*.html'
          ],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit
          // Don't precache index.html to avoid base path issues
          dontCacheBustURLsMatching: /\.\w{8}\./,
          navigateFallback: null, // Disable navigate fallback to avoid issues
          navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
          // Remove modifyURLPrefix as it's causing conflicts with the base path
          runtimeCaching: [
            {
              urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
              handler: 'CacheFirst',
              options: {
                cacheName: 'fonts',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 31536000 // 1 year; files are content-hashed
                }
              }
            },
            {
              // The barcode maker/reader (zxing-wasm) loads only when a barcode
              // type or the Scan page is used; cache it then, so it also works
              // offline afterwards without every visitor downloading it.
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.wasm'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'wasm',
                expiration: {
                  maxEntries: 4,
                  maxAgeSeconds: 31536000 // 1 year; files are content-hashed
                }
              }
            },
            {
              urlPattern: ({ request }) => request.destination === 'document',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 86400 // 1 day
                }
              }
            }
          ]
        },
        devOptions: {
          // enabled: true,
          type: 'module'
        }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
})
