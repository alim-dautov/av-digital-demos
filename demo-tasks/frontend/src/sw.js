/* One service worker for Demo CRM.
   Push and notificationclick stay in public/push-sw.js and are bundled in here,
   so urgent-task notification changes in that file keep working. */
import '../public/push-sw.js'
import { setCacheNameDetails } from 'workbox-core'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

setCacheNameDetails({ prefix: 'demo' })
self.__DEMO_SW_REVISION = '1'

// Previous generateSW runtime caches, including any stored /api responses.
const OBSOLETE_CACHES = ['api-cache', 'shell-static']

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => OBSOLETE_CACHES.includes(key)).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

function isApi(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

// Auth and every other API response stay on the network. Never write them to Cache Storage.
registerRoute(({ url }) => isApi(url), new NetworkOnly())

// Navigations: network first, ignoring the HTTP cache so a deploy is not stuck on an old shell.
// If the network fails, respond with the precached offline page.
registerRoute(({ request, url }) => request.mode === 'navigate' && !isApi(url), async ({ request }) => {
  try {
    const response = await fetch(request.url, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'follow',
      headers: { Accept: request.headers.get('Accept') || 'text/html' },
    })
    if (response) return response
  } catch {
    /* offline or a failed connection */
  }
  const offline = (await matchPrecache('/offline.html')) || (await matchPrecache('offline.html'))
  if (offline) return offline
  return new Response('Нет подключения', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
})
