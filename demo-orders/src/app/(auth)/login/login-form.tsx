"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompanyLogo } from "@/lib/company-apps";
import { DEMO_PASSWORD } from "@/lib/demo";
import { cn } from "@/lib/utils";

const DEMO_USERS = [
  {
    name: "Айдос",
    role: "Владелец · Mebel Demo",
    email: "aidos@example.com",
  },
  {
    name: "Руслан",
    role: "Директор · Mebel Demo",
    email: "ruslan@example.com",
  },
  {
    name: "Серик",
    role: "Управляющий · Mebel Demo",
    email: "serik@example.com",
  },
  {
    name: "Данияр",
    role: "Мастер · Mebel Demo",
    email: "daniyar@example.com",
  },
] as const;

export function LoginForm({
  brand,
  demoEnabled,
}: {
  brand: {
    name: string;
    tagline: string;
    slug: string;
    logo: CompanyLogo["full"] | null;
  } | null;
  demoEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next") ?? "";
  const companyPrefix = brand ? `/c/${brand.slug}` : "";
  const next = companyPrefix
    ? rawNext.startsWith(`${companyPrefix}/`) || rawNext === companyPrefix
      ? rawNext
      : `${companyPrefix}/`
    : /^\/(?![/\\])/.test(rawNext)
      ? rawNext
      : "/";
  const demos = brand
    ? DEMO_USERS.filter((user) =>
        brand.slug === "mebeldemo" ? user.email.endsWith("@example.com") : false,
      )
    : DEMO_USERS;

  const [email, setEmail] = React.useState(
    demoEnabled ? (demos[0]?.email ?? "") : "",
  );
  const [password, setPassword] = React.useState(
    demoEnabled ? DEMO_PASSWORD : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Неверный логин или пароль");
        return;
      }
      if (companyPrefix) {
        window.location.assign(next);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  async function pickDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: demoEmail, password: DEMO_PASSWORD }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Неверный логин или пароль");
        return;
      }
      if (companyPrefix) {
        window.location.assign(next);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(233,140,85,0.1),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(233,140,85,0.05),_transparent_40%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 text-foreground opacity-[0.04] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 text-center">
          {brand?.logo ? (
            <h1 className="mt-3">
              <img
                src={brand.logo.src}
                width={brand.logo.width}
                height={brand.logo.height}
                alt={brand.name}
                fetchPriority="high"
                className="mx-auto h-auto w-[320px] max-w-full drop-shadow-[0_10px_30px_rgba(201,150,60,0.22)]"
              />
            </h1>
          ) : (
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-primary">
              {brand?.name ?? "Mebel Demo"}
            </h1>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {brand?.tagline ?? "Мебель на заказ"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login">Логин или email</Label>
              <Input
                id="login"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="логин"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-11 w-full text-base"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Вход…
                </>
              ) : (
                "Войти"
              )}
            </Button>
          </form>

          {demoEnabled && demos.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-center text-xs text-muted-foreground">
                Быстрый вход · пароль{" "}
                <span className="font-mono text-primary/90">{DEMO_PASSWORD}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {demos.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => void pickDemo(u.email)}
                    disabled={loading}
                    className={cn(
                      "rounded-lg border border-border bg-panel-elevated px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-panel disabled:opacity-60",
                      email === u.email && "border-primary/50 bg-primary/10",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.role}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

