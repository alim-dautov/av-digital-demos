import { companyIconPath, type CompanyApp } from "@/lib/company-apps";
import { SW_TEMPLATE } from "@/lib/pwa/sw-template";

export type ServiceWorkerConfig = {
  name: string;
  cacheName: string;
  /** Only caches with this prefix are cleaned up, so two apps never delete each other's cache. */
  cachePrefix: string;
  shell: string[];
  icon: string;
  badge: string;
  home: string;
  manifest: string;
};

/** Monochrome (white on transparent) status-bar badge of Mebel Demo. */
export const MEBELDEMO_BADGE = "/app-icons/badge-96.png";

/** Root Mebel Demo / owner shell. Cache name kept for continuity with the old static sw.js. */
export const ROOT_SW: ServiceWorkerConfig = {
  name: "Mebel Demo",
  cacheName: "mebeldemo-shell-v9",
  cachePrefix: "mebeldemo-shell-",
  shell: [
    "/manifest.webmanifest",
    "/app-icons/icon-192.png",
    "/app-icons/icon-512.png",
    MEBELDEMO_BADGE,
  ],
  icon: "/app-icons/icon-192.png",
  badge: MEBELDEMO_BADGE,
  home: "/",
  manifest: "/manifest.webmanifest",
};

export function companySwPath(slug: string) {
  return `/c/${slug}/sw.js`;
}

export function companySwConfig(app: CompanyApp): ServiceWorkerConfig {
  const base = `/c/${app.slug}/`;
  const icon = companyIconPath(app.slug, 192);
  const mebeldemo = app.slug === "mebeldemo";
  return {
    name: app.name,
    cacheName: `app-${app.slug}-shell-${mebeldemo ? "v2" : "v1"}`,
    cachePrefix: `app-${app.slug}-shell-`,
    shell: [`${base}manifest.webmanifest`, icon, companyIconPath(app.slug, 512)],
    icon,
    badge: mebeldemo ? MEBELDEMO_BADGE : icon,
    home: base,
    manifest: `${base}manifest.webmanifest`,
  };
}

export function serviceWorkerSource(c: ServiceWorkerConfig): string {
  const j = (v: unknown) => JSON.stringify(v);
  const html = (s: string) => s.replace(/[<>&"]/g, "");
  return SW_TEMPLATE.replace("__NAME__", html(c.name).replace(/\*\//g, ""))
    .replace("__TITLE__", html(c.name))
    .replace("__CACHE__", j(c.cacheName))
    .replace("__CACHE_PREFIX__", j(c.cachePrefix))
    .replace("__SHELL__", j(c.shell))
    .replace("__ICON__", j(c.icon))
    .replace("__BADGE__", j(c.badge))
    .replace("__HOME__", j(c.home))
    .replace("__MANIFEST__", j(c.manifest));
}

export const SW_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=0, must-revalidate",
};
