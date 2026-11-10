"use client";
import { useEffect, useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Switch } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { subscribePush } from "@/components/shell/notifications";
import { markAllReadAction, saveNotifyPrefsAction } from "@/modules/notifications/actions";

export function MarkAllRead() {
  const { pending, run } = useRun();
  const qc = useQueryClient();
  return <Button variant="secondary" loading={pending} icon={<CheckCheck className="size-4" />} onClick={() => run(() => markAllReadAction({}), { onOk: () => qc.invalidateQueries({ queryKey: ["notif-count"] }) })}>Прочитать все</Button>;
}

export function NotifyPrefs({ types, prefs: initial }: { types: { key: string; label: string }[]; prefs: Record<string, boolean> }) {
  const [prefs, setPrefs] = useState(initial);
  const { run } = useRun();
  const set = (k: string, v: boolean) => {
    const next = { ...prefs, [k]: v };
    if (!v && !k.startsWith("push_")) next[`push_${k}`] = false; // без уведомления нет и push
    setPrefs(next);
    run(() => saveNotifyPrefsAction({ prefs: next }), { refresh: false });
  };
  return (
    <div className="px-4 pb-3 sm:px-5">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line pb-2 text-xs font-semibold text-ink-3"><span>Событие</span><span>В приложении</span><span>Push</span></div>
      {types.map((t) => {
        const on = prefs[t.key] !== false;
        return (
          <div key={t.key} className="grid min-h-11 grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line/60 py-1 text-sm last:border-0">
            <span>{t.label}</span>
            <span className="flex w-[84px] justify-center"><Switch checked={on} onChange={(v) => set(t.key, v)} /></span>
            <span className="flex w-9 justify-center"><Switch checked={on && prefs[`push_${t.key}`] !== false} onChange={(v) => set(`push_${t.key}`, v)} /></span>
          </div>
        );
      })}
    </div>
  );
}

export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<"loading" | "on" | "off" | "denied" | "unsupported">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      setState((await reg?.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("off"));
  }, []);
  if (!vapidKey) return <p className="text-sm text-ink-3">Push не настроен на сервере: укажите VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY.</p>;
  if (state === "unsupported") return <p className="text-sm text-ink-3">Браузер не поддерживает push. На iPhone добавьте приложение на экран «Домой» (iOS 16.4+).</p>;
  if (state === "denied") return <p className="text-sm text-warning">Уведомления запрещены в настройках браузера для этого сайта.</p>;
  const toggle = async () => {
    setBusy(true);
    try {
      if (state === "on") {
        const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
        if (sub) { await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
        setState("off"); toast.success("Push выключен");
      } else { await subscribePush(vapidKey); setState("on"); toast.success("Push включён"); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Не удалось"); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{state === "on" ? "Включены на этом устройстве" : state === "loading" ? "Проверяем…" : "Выключены"}</span>
      <Button variant={state === "on" ? "ghost" : "accent"} loading={busy || state === "loading"} icon={<BellRing className="size-4" />} onClick={toggle}>{state === "on" ? "Выключить" : "Включить"}</Button>
    </div>
  );
}
