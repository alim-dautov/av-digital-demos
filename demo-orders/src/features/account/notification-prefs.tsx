"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { NotificationPrefs, NotificationType } from "@/types";

type Props = {
  initial: NotificationPrefs;
  types: { type: NotificationType; label: string }[];
};

function Row({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-lg border px-4 py-3"
    >
      <span>
        <span className="block text-base font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function NotificationPrefsCard({ initial, types }: Props) {
  const [push, setPush] = useState(initial.push);
  const [muted, setMuted] = useState<Set<NotificationType>>(new Set(initial.muted));
  const [saving, setSaving] = useState(false);

  function toggle(type: NotificationType, on: boolean) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (on) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push, muted: [...muted] }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Не удалось сохранить");
      toast.success("Настройки уведомлений сохранены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5" />
          Мои уведомления
        </CardTitle>
        <CardDescription>
          Выберите, какие уведомления получать. Выключенные не показываются и не приходят на
          телефон.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Row
          id="pref-push"
          label="Push на телефон"
          hint="Всплывающие уведомления на устройствах, где они включены"
          checked={push}
          onChange={setPush}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <Row
              key={t.type}
              id={`pref-${t.type}`}
              label={t.label}
              checked={!muted.has(t.type)}
              onChange={(v) => toggle(t.type, v)}
            />
          ))}
        </div>
        <Button size="lg" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
