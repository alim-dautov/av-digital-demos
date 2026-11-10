import { api } from './api'

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on'

const SW_TIMEOUT_MS = 8000

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // Dev has no built /sw.js. Register the push script alone so notifications stay testable.
  // Production uses one worker: /sw.js bundles these same push and notificationclick handlers.
  if (import.meta.env.DEV && !(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/push-sw.js')
  const timeout = new Promise<never>((_, reject) =>
    window.setTimeout(() => reject(new Error('Сервис-воркер не запущен. Обновите страницу и попробуйте снова.')), SW_TIMEOUT_MS),
  )
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

function saveOnServer(sub: PushSubscription): Promise<unknown> {
  return api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) })
}

export async function getPushState(vapidKey: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (!vapidKey) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

export async function enablePush(vapidKey: string): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Уведомления запрещены в настройках браузера')
  const reg = await registration()
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }
  let sub: PushSubscription
  try {
    sub = await reg.pushManager.subscribe(options)
  } catch (err) {
    // A subscription made with an old server key blocks a new one until it is removed.
    const stale = await reg.pushManager.getSubscription()
    if (!stale) throw err
    await stale.unsubscribe()
    sub = await reg.pushManager.subscribe(options)
  }
  await saveOnServer(sub)
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined)
  await sub.unsubscribe()
}

/** Re-links this browser's subscription to whoever is signed in now. */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await saveOnServer(sub)
}

/** Detaches this browser from the account on the server without revoking browser permission. */
export async function detachPushSubscription(): Promise<void> {
  if (!pushSupported()) return
  const sub = await currentSubscription()
  if (sub) await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) })
}

export function sendTestPush(): Promise<{ ok: boolean; sent: number }> {
  return api('/push/test', { method: 'POST', body: '{}' })
}
