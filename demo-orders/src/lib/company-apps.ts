/**
 * One installable app per company.
 * The owner keeps the multi-company shell at `/`.
 * A company app lives under `/c/<slug>/` so the PWA scope cannot leave that company.
 */

export const COMPANY_APP_HEADER = "x-company-app";
export const COMPANY_LOCK_HEADER = "x-company-lock";

/**
 * Transparent artwork in `public/`. `full` includes the wordmark, `mark` is the symbol alone.
 * `printSrc` is PNG because react-pdf cannot decode WebP.
 */
export type CompanyLogo = {
  full: { src: string; printSrc: string; width: number; height: number };
  mark: { src: string; width: number; height: number };
};

export type CompanyApp = {
  companyId: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  logo?: CompanyLogo;
};

export const COMPANY_APPS: readonly CompanyApp[] = [
  {
    companyId: "company_002",
    slug: "shtory-demo",
    name: "Шторы Демо",
    shortName: "Шторы Демо",
    description: "Заказы, шторы и текстиль",
    themeColor: "#1c1610",
    backgroundColor: "#14110c",
    logo: {
      full: {
        src: "/app-icons/brand/shtory-demo/logo.webp",
        printSrc: "/app-icons/brand/shtory-demo/logo-print.png",
        width: 1600,
        height: 998,
      },
      mark: { src: "/app-icons/brand/shtory-demo/mark.webp", width: 453, height: 512 },
    },
  },
  {
    companyId: "company_001",
    slug: "mebeldemo",
    name: "Mebel Demo",
    shortName: "Mebel Demo",
    description: "Мебель на заказ",
    themeColor: "#0B0D0B",
    backgroundColor: "#070807",
    logo: {
      full: {
        src: "/app-icons/brand/mebeldemo/logo.png",
        printSrc: "/app-icons/brand/mebeldemo/logo-print.png",
        width: 1280,
        height: 560,
      },
      mark: { src: "/app-icons/brand/mebeldemo/mark.png", width: 512, height: 512 },
    },
  },
  {
    companyId: "company_003",
    slug: "company-3",
    name: "Компания 3",
    shortName: "Компания 3",
    description: "Ремонт и строительство",
    themeColor: "#121410",
    backgroundColor: "#0c0e0c",
  },
  {
    companyId: "company_004",
    slug: "company-4",
    name: "Компания 4",
    shortName: "Компания 4",
    description: "Мебель на заказ",
    themeColor: "#121410",
    backgroundColor: "#0c0e0c",
  },
  {
    companyId: "company_005",
    slug: "company-5",
    name: "Компания 5",
    shortName: "Компания 5",
    description: "Мебель на заказ",
    themeColor: "#121410",
    backgroundColor: "#0c0e0c",
  },
  {
    companyId: "company_006",
    slug: "company-6",
    name: "Компания 6",
    shortName: "Компания 6",
    description: "Мебель на заказ",
    themeColor: "#121410",
    backgroundColor: "#0c0e0c",
  },
];

const STATIC_PREFIXES = ["/api/", "/_next/", "/app-icons/", "/fonts/"];

export function getCompanyAppBySlug(slug: string): CompanyApp | null {
  return COMPANY_APPS.find((app) => app.slug === slug) ?? null;
}

export function getCompanyAppById(companyId: string): CompanyApp | null {
  return COMPANY_APPS.find((app) => app.companyId === companyId) ?? null;
}

export function getCompanyLogo(companyId: string): CompanyLogo | null {
  return getCompanyAppById(companyId)?.logo ?? null;
}

export function companyBasePath(slug: string): string {
  return `/c/${slug}/`;
}

export function companyIconPath(slug: string, size: 180 | 192 | 512): string {
  return `/app-icons/companies/${slug}-${size}.png`;
}

/** Artwork kept inside the central 80% so Android circle/squircle masks do not clip it. */
export function companyMaskableIconPath(slug: string): string {
  return `/app-icons/companies/${slug}-maskable-512.png`;
}

/** `/c/<slug>` or `/c/<slug>/...` for a known company. `rest` always starts with `/`. */
export function matchCompanyPath(
  pathname: string,
): { app: CompanyApp; rest: string } | null {
  const match = pathname.match(/^\/c\/([a-z0-9-]+)(\/.*)?$/);
  if (!match) return null;
  const app = getCompanyAppBySlug(match[1]);
  if (!app) return null;
  const rest = match[2] && match[2].length > 0 ? match[2] : "/";
  return { app, rest };
}

/** Browser path inside a company app, as the existing pages understand it. */
export function toAppPathname(pathname: string): string {
  const match = matchCompanyPath(pathname);
  if (!match) return pathname;
  if (match.rest === "/") return "/";
  return match.rest;
}

export function prefixAppPath(slug: string, path: string): string {
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const withoutHash = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const queryAt = withoutHash.indexOf("?");
  const search = queryAt >= 0 ? withoutHash.slice(queryAt) : "";
  const pathname = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return path;

  const base = `/c/${slug}`;
  if (pathname === base || pathname.startsWith(`${base}/`)) return path;
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return path;
  if (
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
  ) {
    return path;
  }

  const next = pathname === "/" ? `${base}/` : `${base}${pathname}`;
  return `${next}${search}${hash}`;
}

export function companyManifest(app: CompanyApp) {
  const start = companyBasePath(app.slug);
  return {
    id: start,
    name: app.name,
    short_name: app.shortName,
    description: app.description,
    start_url: start,
    scope: start,
    display: "standalone" as const,
    orientation: "any" as const,
    theme_color: app.themeColor,
    background_color: app.backgroundColor,
    lang: "ru",
    icons: [
      {
        src: companyIconPath(app.slug, 192),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: companyIconPath(app.slug, 512),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: companyMaskableIconPath(app.slug),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

/**
 * Runs before hydration.
 * Company pages are rewrites, so client-side routing must not leave the prefix.
 * In-app navigations become full page loads under `/c/<slug>/`.
 */
export function companyScopeScript(slug: string): string {
  const safe = getCompanyAppBySlug(slug)?.slug;
  if (!safe) return "";
  return `(()=>{var P="/c/${safe}";function skip(p){return p.indexOf("/api/")===0||p.indexOf("/_next/")===0||p.indexOf("/app-icons/")===0||p.indexOf("/fonts/")===0||p==="/sw.js"||p==="/manifest.webmanifest"||p==="/favicon.ico"||/\\.[a-z0-9]+$/i.test(p);}function dest(url){if(url==null)return null;try{var u=new URL(String(url),location.origin);if(u.origin!==location.origin)return null;var p=u.pathname;if(skip(p))return u.pathname+u.search+u.hash;if(p.indexOf("/c/")===0){if(p===P||p.indexOf(P+"/")===0)return u.pathname+u.search+u.hash;return P+"/";}if(p!==P)u.pathname=p==="/"?(P+"/"):(P+p);return u.pathname+u.search+u.hash;}catch(e){return null;}}function here(){return location.pathname+location.search+location.hash;}function keep(method,s,t,u){if(u==null)return method.call(history,s,t,u);var d=dest(u);if(!d)return method.call(history,s,t,u);if(d!==here()){location.assign(d);return;}return method.call(history,s,t,d);}var ps=history.pushState,rs=history.replaceState;history.pushState=function(s,t,u){return keep(ps,s,t,u);};history.replaceState=function(s,t,u){return keep(rs,s,t,u);};var assign=location.assign.bind(location),replace=location.replace.bind(location);location.assign=function(u){var d=dest(u);return assign(d||u);};location.replace=function(u){var d=dest(u);return replace(d||u);};document.addEventListener("click",function(e){if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var n=e.target,a=n&&n.closest?n.closest("a"):null;if(!a||(a.target&&a.target!=="_self")||a.hasAttribute("download"))return;var href=a.getAttribute("href");if(!href||href.charAt(0)==="#")return;var d=dest(href);if(!d)return;e.preventDefault();if(d!==here())location.assign(d);},true);})();`;
}

/**
 * The company app a same-origin page lives in, judged by its Referer. Used to scope
 * plain `/api/*` calls made from `/c/<slug>/…` pages to that company.
 */
export function companyAppFromReferer(referer: string | null, host: string | null) {
  if (!referer || !host) return null;
  try {
    const url = new URL(referer);
    if (url.host !== host) return null;
    return matchCompanyPath(url.pathname)?.app ?? null;
  } catch {
    return null;
  }
}
