"use client";

import { swLocation } from "@/lib/pwa/sw-location";

export type PushPlatform = "ios" | "android" | "desktop";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function detectPlatform(): PushPlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Registrations that may hold this page's subscription: own worker first, legacy root worker second. */
async function registrations(): Promise<ServiceWorkerRegistration[]> {
  const { scope } = swLocation(window.location.pathname);
  const scopes = scope === "/" ? ["/"] : [scope, "/"];
  const all = await navigator.serviceWorker.getRegistrations();
  return scopes
    .map((sc) => all.find((r) => new URL(r.scope).pathname === sc))
    .filter((r): r is ServiceWorkerRegistration => Boolean(r));
}

async function existingSubscription(): Promise<PushSubscription | null> {
  for (const reg of await registrations()) {
    const sub = await reg.pushManager.getSubscription();
    if (sub) return sub;
  }
  return null;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const { script, scope } = swLocation(window.location.pathname);
  const existing = await navigator.serviceWorker.getRegistration(scope);
  if (existing && new URL(existing.scope).pathname === scope) return existing;
  return navigator.serviceWorker.register(script, { scope });
}

export async function currentPushEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const sub = await existingSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** Asks for permission (must be called from a click) and registers the device on the server. */
export async function enablePush(publicKey: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  let sub: PushSubscription;
  try {
    const existing = await existingSubscription();
    const reg = existing ? null : await registration();
    sub =
      existing ??
      (await reg!.pushManager.getSubscription()) ??
      (await reg!.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      }));
  } catch {
    throw new Error(
      "Браузер не смог подключиться к службе уведомлений. Откройте сайт в Chrome, Safari, Edge или Firefox.",
    );
  }
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Не удалось подписаться на уведомления");
  }
  return permission;
}

/** Logs out and detaches this device from the user's push notifications. */
export async function logoutDevice(): Promise<void> {
  const pushEndpoint = await currentPushEndpoint();
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pushEndpoint }),
  });
}

export async function disablePush(): Promise<void> {
  const sub = await existingSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe();
}
