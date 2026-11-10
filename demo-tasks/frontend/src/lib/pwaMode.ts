/**
 * iPhone/iPad home-screen app (PWA). There WebKit blocks third-party cookies/storage for the Wazzup
 * iframe (ITP, no per-site exception), so the chat list may load but the dialog never opens.
 * In that mode the chat window is opened as a first-party page instead.
 */
export function isIosStandalone(nav: { standalone?: boolean; userAgent?: string; maxTouchPoints?: number } = globalThis.navigator as { standalone?: boolean; userAgent?: string; maxTouchPoints?: number }): boolean {
  const ua = nav.userAgent ?? ''
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
  const standalone = nav.standalone === true || (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  return ios && standalone
}
