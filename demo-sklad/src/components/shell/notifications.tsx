"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, Skeleton, cn } from "@/components/ui";
import { fmtRelative } from "@/lib/format";

type Item = { id: number; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function subscribePush(vapidKey: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Браузер не поддерживает push-уведомления");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Уведомления запрещены в настройках браузера");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
  const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  if (!r.ok) throw new Error("Не удалось сохранить подписку");
}

export function NotificationsBell({ vapidKey }: { vapidKey: string | null }) {
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<NotificationPermission | "unsupported">("default");
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const count = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => fetch("/api/notifications?count=1").then((r) => r.json() as Promise<{ unread: number }>),
    refetchInterval: 45_000, refetchOnWindowFocus: true, staleTime: 20_000,
  });
  const list = useQuery({
    queryKey: ["notif-list"], enabled: open,
    queryFn: () => fetch("/api/notifications").then((r) => r.json() as Promise<{ unread: number; items: Item[] }>),
  });
  useEffect(() => {
    setPushState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);
  const unread = count.data?.unread ?? 0;
  const read = async (id?: number) => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    qc.invalidateQueries({ queryKey: ["notif-count"] });
    qc.invalidateQueries({ queryKey: ["notif-list"] });
  };
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`} aria-expanded={open}>
        <Bell className="size-5" />
        {unread > 0 && <span className="tnum absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-bg">{unread > 99 ? "99+" : unread}</span>}
      </Button>
      {open && (
        <div className="animate-pop fixed inset-x-3 top-[64px] z-50 flex max-h-[75dvh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[400px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-bold">Уведомления</p>
            {unread > 0 && <Button variant="ghost" size="sm" icon={<CheckCheck className="size-4" />} onClick={() => read()}>Прочитать все</Button>}
          </div>
          {vapidKey && pushState === "default" && (
            <div className="flex items-center gap-3 border-b border-line bg-yellow-50 px-4 py-3 dark:bg-white/5">
              <BellRing className="size-5 shrink-0 text-navy dark:text-yellow" />
              <p className="flex-1 text-xs leading-snug text-ink-2">Получайте push о задачах, лидах и заявках, даже когда приложение закрыто.</p>
              <Button size="sm" variant="primary" onClick={async () => {
                try { await subscribePush(vapidKey); setPushState("granted"); toast.success("Push-уведомления включены"); }
                catch (e) { setPushState(typeof Notification === "undefined" ? "unsupported" : Notification.permission); toast.error((e as Error).message); }
              }}>Включить</Button>
            </div>
          )}
          <div className="scroll-thin flex-1 overflow-y-auto">
            {list.isLoading && <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
            {list.data && list.data.items.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-3">Пока ничего нового</p>}
            {list.data?.items.map((n) => {
              const body = (
                <>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-yellow")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm leading-snug", n.readAt ? "text-ink-2" : "font-semibold text-ink")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-xs text-ink-3">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-ink-3">{fmtRelative(n.createdAt)}</span>
                  </span>
                </>
              );
              const cls = "flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-2";
              return n.link
                ? <Link key={n.id} href={n.link} className={cls} onClick={() => { if (!n.readAt) read(n.id); setOpen(false); }}>{body}</Link>
                : <button key={n.id} className={cls} onClick={() => !n.readAt && read(n.id)}>{body}</button>;
            })}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="border-t border-line px-4 py-3 text-center text-sm font-semibold text-info hover:bg-surface-2">Все уведомления и настройки</Link>
        </div>
      )}
    </div>
  );
}
