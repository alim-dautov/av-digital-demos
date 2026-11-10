/* Web Push handlers, imported into the generated Workbox service worker. */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Demo CRM'
  event.waitUntil(Promise.all([updateBadge(data.badgeCount), showPush(title, data)]))
})

/* Red dot/number on the installed app icon: unread @mentions, cleared at zero. */
function updateBadge(count) {
  const nav = self.navigator
  if (typeof count !== 'number' || !nav) return Promise.resolve()
  try {
    if (count > 0 && nav.setAppBadge) return nav.setAppBadge(count).catch(() => {})
    if (count <= 0 && nav.clearAppBadge) return nav.clearAppBadge().catch(() => {})
  } catch {
    /* badging unsupported */
  }
  return Promise.resolve()
}

function showPush(title, data) {
  return self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/pwa-icons/icon-192-v2.png',
    badge: '/pwa-icons/icon-192-v2.png',
    lang: 'ru',
    tag: data.tag || data.url || undefined,
    renotify: Boolean(data.tag || data.url),
    requireInteraction: Boolean(data.requireInteraction),
    data: { url: data.url || '/dashboard' },
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((focused) => ('navigate' in focused ? focused.navigate(target) : focused))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
