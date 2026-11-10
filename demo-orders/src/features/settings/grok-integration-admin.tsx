"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { GrokAdminView } from "@/lib/integrations/grok/admin-view";
import type { GrokCommandGroup } from "@/lib/integrations/grok/commands";
import type { GrokCheck, GrokStatus } from "@/lib/integrations/grok/settings";
import type { GrokConnectorMode, GrokLogEntry, GrokLogOutcome } from "@/types";
import { cn } from "@/lib/utils";

const STATUS: Record<GrokStatus, { label: string; variant: "success" | "destructive" | "secondary" }> = {
  connected: { label: "Подключена", variant: "success" },
  disconnected: { label: "Не подключена", variant: "secondary" },
  error: { label: "Ошибка", variant: "destructive" },
};

const GROUPS: Record<GrokCommandGroup, string> = {
  orders: "Заказы",
  finance: "Финансы и себестоимость",
  staff: "Сотрудники и задачи",
  notifications: "Уведомления",
};

const OUTCOMES: Record<GrokLogOutcome, string> = {
  ok: "Выполнено",
  preview: "Тест",
  confirmation_required: "Ждёт подтверждения",
  denied: "Отказ",
  error: "Ошибка",
};

function formatAt(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  }).format(new Date(iso));
}

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

function LogList({ entries, empty }: { entries: GrokLogEntry[]; empty: string }) {
  if (!entries.length) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
          <span className="tabular-nums text-muted-foreground">{formatAt(e.at)}</span>
          <span className="font-mono text-xs">{e.command}</span>
          <span
            className={cn(
              "text-xs",
              e.outcome === "error" || e.outcome === "denied" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {OUTCOMES[e.outcome]} · {e.status}
          </span>
          {e.actorName && <span className="text-xs text-muted-foreground">{e.actorName}</span>}
          {e.message && <span className="w-full truncate text-xs text-muted-foreground">{e.message}</span>}
        </li>
      ))}
    </ul>
  );
}

export function GrokIntegrationAdmin({ initial }: { initial: GrokAdminView }) {
  const [view, setView] = useState(initial);
  const [enabled, setEnabled] = useState(initial.settings.enabled);
  const [mode, setMode] = useState<GrokConnectorMode>(initial.settings.mode);
  const [commands, setCommands] = useState(initial.settings.allowedCommands);
  const [userIds, setUserIds] = useState(initial.settings.allowedUserIds);
  const [checks, setChecks] = useState<GrokCheck[] | null>(null);
  const [busy, setBusy] = useState<"save" | "check" | null>(null);

  const status = STATUS[view.status];
  const groups = Object.keys(GROUPS) as GrokCommandGroup[];

  async function save() {
    setBusy("save");
    try {
      const res = await fetch("/api/settings/grok", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, mode, allowedCommands: commands, allowedUserIds: userIds }),
      });
      const json = (await res.json().catch(() => ({}))) as GrokAdminView & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Не удалось сохранить");
      setView(json);
      setCommands(json.settings.allowedCommands);
      setUserIds(json.settings.allowedUserIds);
      toast.success("Настройки Grok Bot сохранены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    try {
      const res = await fetch("/api/settings/grok", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        check?: { ok: boolean; checks: GrokCheck[] };
        view?: GrokAdminView;
      };
      if (!res.ok || !json.check || !json.view) throw new Error(json.error ?? "Не удалось проверить");
      setChecks(json.check.checks);
      setView(json.view);
      if (json.check.ok) toast.success("Коннектор готов принимать запросы");
      else toast.error("Коннектор ещё не готов");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="integrations">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Bot className="size-4" aria-hidden />
          Интеграции → Grok Bot
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardTitle>
        <CardDescription>
          Защищённый API, через который ИИ-ассистент читает данные и выполняет разрешённые действия
          от имени выбранного сотрудника. Ассистент не получает больше прав, чем у этого сотрудника.
          Способ подключения согласуется с владельцем Grok Bot; сам факт настройки не означает, что
          бот уже подключён.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Адрес API</dt>
          <dd className="break-all font-mono text-xs">{view.endpoint}</dd>
          <dt className="text-muted-foreground">Авторизация</dt>
          <dd>
            {view.auth.method}.{" "}
            {view.auth.tokenConfigured ? (
              <span className="text-success">Токен задан в окружении сервера</span>
            ) : (
              <span className="text-destructive">
                Токен не задан: переменная GROK_CONNECTOR_TOKEN на сервере
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Последний успешный запрос</dt>
          <dd>{formatAt(view.settings.lastSuccessAt)}</dd>
          <dt className="text-muted-foreground">Проверка соединения</dt>
          <dd>
            {view.settings.lastCheckAt
              ? `${formatAt(view.settings.lastCheckAt)} · ${view.settings.lastCheckOk ? "готов" : "не готов"}`
              : "не проводилась"}
          </dd>
          {view.settings.lastError && (
            <>
              <dt className="text-muted-foreground">Последняя ошибка</dt>
              <dd className="text-destructive">
                {formatAt(view.settings.lastErrorAt)} · {view.settings.lastError}
              </dd>
            </>
          )}
        </dl>

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span>Интеграция включена</span>
          </label>
          <div className="space-y-2">
            <p className="font-medium">Режим</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Режим">
              {(["test", "live"] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={mode === m}
                  variant={mode === m ? "default" : "outline"}
                  onClick={() => setMode(m)}
                >
                  {m === "test" ? "Тестовый" : "Рабочий"}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground">
              {mode === "test"
                ? "Чтение работает, действия только показывают, что было бы сделано. Данные не меняются."
                : "Действия меняют реальные данные. Каждое требует повторного запроса с подтверждением и записывается в журнал."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-medium">От чьего имени может работать бот</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {view.users.map((u) => (
              <label key={u.id} className="flex items-center gap-3">
                <Checkbox
                  checked={userIds.includes(u.id)}
                  onCheckedChange={(v) => setUserIds((list) => toggle(list, u.id, v === true))}
                />
                <span>
                  {u.fullName} <span className="text-muted-foreground">· {u.role}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <p className="font-medium">Разрешённые операции</p>
          {groups.map((g) => (
            <div key={g} className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{GROUPS[g]}</p>
              {view.commands
                .filter((c) => c.group === g)
                .map((c) => (
                  <label
                    key={c.name}
                    className={cn("flex items-start gap-3", c.kind === "critical" && "opacity-60")}
                  >
                    <Checkbox
                      className="mt-0.5"
                      disabled={c.kind === "critical"}
                      checked={c.kind !== "critical" && commands.includes(c.name)}
                      onCheckedChange={(v) => setCommands((list) => toggle(list, c.name, v === true))}
                    />
                    <span>
                      {c.label}{" "}
                      {c.kind === "write" && <Badge variant="warning">изменяет данные</Badge>}
                      {c.kind === "critical" && <Badge variant="outline">только в CRM</Badge>}
                      <span className="block text-xs text-muted-foreground">
                        {c.description} Права: {c.permission}.{" "}
                        <span className="font-mono">{c.name}</span>
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy !== null} onClick={() => void save()}>
            {busy === "save" && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void check()}>
            {busy === "check" ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
            Проверить соединение
          </Button>
        </div>

        {checks && (
          <ul className="space-y-1">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                {c.ok ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                ) : (
                  <XCircle className="size-4 text-destructive" aria-hidden />
                )}
                {c.label}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <p className="font-medium">Журнал ошибок</p>
          <LogList entries={view.errors} empty="Ошибок нет." />
        </div>
        <div className="space-y-2">
          <p className="font-medium">Последние запросы</p>
          <LogList entries={view.logs} empty="Запросов ещё не было." />
        </div>
      </CardContent>
    </Card>
  );
}
