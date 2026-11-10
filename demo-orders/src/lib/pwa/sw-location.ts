/** Which service worker serves the current page: company apps get their own, scoped to /c/<slug>/. */
export function swLocation(pathname: string): { script: string; scope: string } {
  const m = /^\/c\/([a-z0-9-]+)(?:\/|$)/.exec(pathname);
  if (m) return { script: `/c/${m[1]}/sw.js`, scope: `/c/${m[1]}/` };
  return { script: "/sw.js", scope: "/" };
}
