"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKzt, formatTimeRu } from "@/lib/utils";

type ScanSuccess = {
  checkInAt: string;
  lateMinutes: number;
  penaltyAmount: number;
};

type AttendanceScanClientProps = {
  employeeName: string;
};

export function AttendanceScanClient({ employeeName }: AttendanceScanClientProps) {
  const [manualToken, setManualToken] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<ScanSuccess | null>(null);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const scannerRef = React.useRef<HTMLDivElement>(null);
  const html5QrRef = React.useRef<{
    stop: () => Promise<void>;
    clear: () => void;
  } | null>(null);
  const scanningLock = React.useRef(false);

  const submitToken = React.useCallback(async (rawToken: string) => {
    const token = rawToken.trim();
    if (!token || scanningLock.current) return;

    scanningLock.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось отметить приход");
      }

      setSuccess({
        checkInAt: data.checkInAt,
        lateMinutes: data.lateMinutes ?? 0,
        penaltyAmount: data.penaltyAmount ?? 0,
      });
      toast.success("Приход зафиксирован");

      if (html5QrRef.current) {
        try {
          await html5QrRef.current.stop();
          html5QrRef.current.clear();
        } catch {
          // ignore stop errors
        }
        html5QrRef.current = null;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сканирования");
      scanningLock.current = false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  React.useEffect(() => {
    if (success) return;
    let cancelled = false;

    async function startCamera() {
      if (!scannerRef.current) return;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !scannerRef.current) return;

        const scanner = new Html5Qrcode(scannerRef.current.id);
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            void submitToken(decoded);
          },
          () => {
            // ignore frame decode misses
          },
        );

        if (!cancelled) setCameraReady(true);
      } catch (e) {
        if (!cancelled) {
          setCameraError(
            e instanceof Error
              ? e.message
              : "Камера недоступна — введите код вручную",
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      const scanner = html5QrRef.current;
      html5QrRef.current = null;
      if (scanner) {
        void scanner.stop().then(() => scanner.clear()).catch(() => undefined);
      }
    };
  }, [success, submitToken]);

  if (success) {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <CheckCircle2 className="size-12" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          Приход зафиксирован: {formatTimeRu(success.checkInAt)}
        </h1>
        <p className="mt-2 text-muted-foreground">{employeeName}</p>
        {success.lateMinutes > 0 ? (
          <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            Опоздание {success.lateMinutes} мин
            {success.penaltyAmount > 0
              ? ` · штраф ${formatKzt(success.penaltyAmount)}`
              : ""}
          </p>
        ) : (
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">
            Вовремя
          </p>
        )}
        <Button asChild className="mt-8" variant="outline">
          <Link href="/attendance">К посещаемости</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/attendance">
            <ArrowLeft className="size-4" />
            Назад
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Сканировать QR
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Наведите камеру на код в цехе, {employeeName}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-black">
        <div
          id="attendance-qr-reader"
          ref={scannerRef}
          className="min-h-[280px] w-full overflow-hidden [&_video]:mx-auto [&_video]:max-h-[360px]"
        />
        {!cameraReady && !cameraError && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/70">
            <Loader2 className="size-4 animate-spin" />
            Запуск камеры…
          </div>
        )}
      </div>

      {cameraError && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {cameraError}
        </p>
      )}

      <form
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submitToken(manualToken);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="token">Или введите код вручную</Label>
          <Input
            id="token"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="TAV-QR-… или JSON"
            autoComplete="off"
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting || !manualToken.trim()}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Проверка…
            </>
          ) : (
            "Отметить приход"
          )}
        </Button>
      </form>
    </div>
  );
}
