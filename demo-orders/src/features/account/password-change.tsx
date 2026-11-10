"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN = 6;

export function PasswordChange() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN;
  const ready = current.length > 0 && next.length >= MIN && next === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next, confirm }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Не удалось сменить пароль");
      toast.success("Пароль изменён");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сменить пароль");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5" />
          Смена пароля
        </CardTitle>
        <CardDescription>Минимум {MIN} символов, например «Name123».</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pw-current">Текущий пароль</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              className="h-12 text-base"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-next">Новый пароль</Label>
            <Input
              id="pw-next"
              type="password"
              autoComplete="new-password"
              className="h-12 text-base"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={tooShort}
            />
            {tooShort && (
              <p className="text-sm text-destructive">Не короче {MIN} символов</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-confirm">Повторите новый пароль</Label>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              className="h-12 text-base"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
            />
            {mismatch && <p className="text-sm text-destructive">Пароли не совпадают</p>}
          </div>
          <Button type="submit" size="lg" disabled={!ready || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Сменить пароль
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
