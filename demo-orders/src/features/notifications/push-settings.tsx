"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  currentPushEndpoint,
  detectPlatform,
  disablePush,
  enablePush,
  isStandalone,
  pushSupported,
  type PushPlatform,
} from "@/lib/push-client";
import { cn } from "@/lib/utils";

type State =
  | { kind: "loading" }
  | { kind: "unsupported"; platform: PushPlatform; standalone: boolean }
  | { kind: "not-configured" }
  | { kind: "denied"; platform: PushPlatform }
  | { kind: "off"; publicKey: string }
  | { kind: "on"; publicKey: string };

const DENIED_HELP: Record<PushPlatform, string[]> = {
  ios: [
    "Откройте «Настройки» iPhone → «Уведомления».",
    "Найдите приложение на экране «Домой» в списке и включите «Допуск уведомлений».",
    "Вернитесь в приложение и обновите страницу.",
  ],
  android: [
    "Нажмите на значок замка или «⋮» рядом с адресной строкой → «Настройки сайта».",
    "Откройте «Уведомления» и выберите «Разрешить».",
    "Если приложение установлено: «Настройки» Android → «Приложения» → приложение → «Уведомления».",
  ],
  desktop: [
    "Нажмите на значок замка слева от адреса сайта.",
    "В пункте «Уведомления» выберите «Разрешить».",
    "Обновите страницу. В macOS проверьте также «Системные настройки» → «Уведомления» → браузер.",
  ],
};

async function serverStatus(endpoint: string | null) {
  const res = await fetch(
    `/api/push/subscribe${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`,
  );
  if (!res.ok) return null;
  return (await res.json()) as { configured: boolean; publicKey: string | null; subscribed: boolean };
}

export function PushSettings({ variant = "card" }: { variant?: "card" | "compact" }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const platform = detectPlatform();
    if (!pushSupported()) {
      setState({ kind: "unsupported", platform, standalone: isStandalone() });
      return;
    }
    const endpoint = await currentPushEndpoint();
    const status = await serverStatus(endpoint);
    if (!status?.configured || !status.publicKey) {
      setState({ kind: "not-configured" });
      return;
    }
    if (Notification.permission === "denied") {
      setState({ kind: "denied", platform });
      return;
    }
    if (Notification.permission === "granted" && endpoint && !status.subscribed) {
      // Device was detached on logout of another user: attach it to the current one silently.
      try {
        await enablePush(status.publicKey);
        setState({ kind: "on", publicKey: status.publicKey });
        return;
      } catch {
        /* fall through to "off" */
      }
    }
    setState({
      kind: Notification.permission === "granted" && endpoint && status.subscribed ? "on" : "off",
      publicKey: status.publicKey,
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function turnOn(publicKey: string) {
    setBusy(true);
    try {
      const permission = await enablePush(publicKey);
      if (permission === "granted") toast.success("Уведомления включены на этом устройстве");
      else if (permission === "denied") toast.error("Уведомления запрещены в настройках браузера");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось включить уведомления");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disablePush();
      toast.success("Уведомления на этом устройстве отключены");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Не удалось отправить");
      toast.success("Тестовое уведомление отправлено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "compact") {
    if (state.kind !== "off" && state.kind !== "denied" && state.kind !== "unsupported") return null;
    if (state.kind === "unsupported" && !(state.platform === "ios" && !state.standalone)) return null;
    return (
      <div className="border-b border-border bg-primary/[0.04] px-4 py-3 text-xs">
        {state.kind === "off" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Получайте уведомления на это устройство</span>
            <Button
              size="sm"
              className="h-7 shrink-0"
              disabled={busy}
              onClick={() => void turnOn(state.publicKey)}
            >
              Включить
            </Button>
          </div>
        )}
        {state.kind === "denied" && (
          <div className="space-y-1 text-muted-foreground">
            <p className="font-medium text-destructive">Уведомления запрещены. Как разрешить:</p>
            <ol className="list-inside list-decimal space-y-0.5">
              {DENIED_HELP[state.platform].map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        )}
        {state.kind === "unsupported" && (
          <p className="text-muted-foreground">
            На iPhone уведомления работают после «Поделиться» → «На экран Домой» (iOS 16.4+).
          </p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4" aria-hidden />
          Push-уведомления
        </CardTitle>
        <CardDescription>
          Новые заказы в цех, принятие заказа и другие события приходят на телефон и компьютер,
          даже когда приложение закрыто.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state.kind === "loading" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Проверяем устройство…
          </p>
        )}
        {state.kind === "not-configured" && (
          <p className="text-muted-foreground">
            Сервер не настроен для отправки push-уведомлений (нет ключей VAPID).
          </p>
        )}
        {state.kind === "unsupported" &&
          (state.platform === "ios" && !state.standalone ? (
            <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
              <li>Откройте сайт в Safari (iOS 16.4 или новее).</li>
              <li>Нажмите «Поделиться» → «На экран Домой».</li>
              <li>Запустите приложение с экрана «Домой» и вернитесь в этот раздел.</li>
            </ol>
          ) : (
            <p className="text-muted-foreground">
              Этот браузер не поддерживает push-уведомления. Используйте Chrome, Edge, Firefox или
              Safari последней версии.
            </p>
          ))}
        {state.kind === "denied" && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <BellOff className="size-4" /> Уведомления запрещены для этого сайта
            </p>
            <p className="text-muted-foreground">Как разрешить:</p>
            <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
              {DENIED_HELP[state.platform].map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Проверить снова
            </Button>
          </div>
        )}
        {(state.kind === "off" || state.kind === "on") && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "mr-2 text-sm",
                state.kind === "on" ? "text-success" : "text-muted-foreground",
              )}
            >
              {state.kind === "on" ? "Включены на этом устройстве" : "Выключены на этом устройстве"}
            </span>
            {state.kind === "off" ? (
              <Button size="sm" disabled={busy} onClick={() => void turnOn(state.publicKey)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                Включить
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void test()}>
                  <Send className="size-4" />
                  Отправить тест
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void turnOff()}>
                  Отключить
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
