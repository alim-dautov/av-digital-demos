import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicHtml = path.join(rootDir, 'public_html')

function cleanStaleBuild(): Plugin {
  return {
    name: 'clean-stale-build',
    apply: 'build',
    buildStart() {
      fs.rmSync(path.join(publicHtml, 'assets'), { recursive: true, force: true })
      for (const name of ['sw.js', 'sw.js.map', 'registerSW.js', 'manifest.webmanifest']) {
        fs.rmSync(path.join(publicHtml, name), { force: true })
      }
      if (!fs.existsSync(publicHtml)) return
      for (const file of fs.readdirSync(publicHtml)) {
        if (/^workbox-.*\.js(\.map)?$/.test(file)) fs.rmSync(path.join(publicHtml, file), { force: true })
      }
    },
  }
}

function singleManifestLink(): Plugin {
  return {
    name: 'single-manifest-link',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let seen = false
        let next = html.replace(/<link rel="manifest"[^>]*>/g, (tag) => {
          if (seen) return ''
          seen = true
          return tag
        })
        next = next.replace(/<script type="module"(?![^>]*fetchpriority)/, '<script type="module" fetchpriority="high"')
        const login = Object.values(ctx.bundle ?? {}).find(
          (item) => item.type === 'chunk' && item.fileName.includes('LoginPage-'),
        )
        if (login && !next.includes(login.fileName)) {
          next = next.replace('</head>', `<link rel="modulepreload" crossorigin href="/${login.fileName}"></head>`)
        }
        return next
      },
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cleanStaleBuild(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'offline.html',
        'pwa-icons/*.png',
        'apple-touch-icon-v2.png',
        'favicon-v2.svg',
        'favicon-v2.ico',
        'favicon-32-v2.png',
      ],
      manifest: {
        name: 'Demo CRM',
        short_name: 'Demo CRM',
        description: 'CRM демонстрационной компании — задачи, продажи, контроль',
        lang: 'ru',
        id: '/dashboard',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0B0B0D',
        background_color: '#0B0B0D',
        start_url: '/dashboard',
        scope: '/',
        // Plesk aliases the icons directory, so these URLs live under /pwa-icons/. v2 names bust installed-client caches.
        icons: [
          { src: '/pwa-icons/icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icons/icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icons/icon-192-maskable-v2.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-icons/icon-512-maskable-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Задачи',
            short_name: 'Задачи',
            url: '/tasks',
            icons: [{ src: '/pwa-icons/icon-192-v2.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Создать задачу',
            short_name: 'Создать',
            url: '/tasks?create=1',
            icons: [{ src: '/pwa-icons/icon-192-v2.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        globIgnores: ['**/sw.js', '**/sw.js.map', '**/workbox-*.js', '**/push-sw.js', '**/index.php', '**/*.map'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
    singleManifestLink(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../public_html',
    emptyOutDir: false,
    assetsDir: 'assets',
    modulePreload: { polyfill: false },
  },
})
