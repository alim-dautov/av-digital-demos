/* Electro Demo CRM — Service Worker: офлайн-страница, кэш статики, Web Push */
const VERSION = "demo-v1";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/brand/logo-full.svg", "/brand/logo-mark.svg", "/brand/icon.svg", "/brand/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Навигация: сеть, при офлайне — офлайн-страница
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  // Статика Next и бренд: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || /\.(woff2?|svg|png|webp)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});

self.addEventListener("push", (e) => {
  let data = { title: "Electro Demo CRM", body: "", link: "/" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: "/brand/icons/icon-192.png", badge: "/brand/icons/icon-maskable-192.png", tag: data.tag, data: { link: data.link || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(link); return c.focus(); }
    return self.clients.openWindow(link);
  }));
});
