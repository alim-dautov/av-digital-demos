"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type QrPayload = {
  token: string;
  expiresAt: string;
  qrDataUrl: string;
};

export function AttendanceQrDisplay() {
  const [qr, setQr] = React.useState<QrPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [rotating, setRotating] = React.useState(false);
  const refreshingRef = React.useRef(false);

  const fetchQr = React.useCallback(async (forceRotate = false) => {
    if (refreshingRef.current && !forceRotate) return;
    refreshingRef.current = true;
    try {
      const res = await fetch(
        forceRotate ? "/api/attendance/rotate" : "/api/attendance/qr",
        { method: forceRotate ? "POST" : "GET" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось загрузить QR");
      }
      setQr((current) => (current?.token === data.token ? current : data));
      const left = Math.max(
        0,
        Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(left);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки QR");
    } finally {
      setLoading(false);
      setRotating(false);
      refreshingRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    const initialFetch = window.setTimeout(() => void fetchQr(), 0);
    return () => window.clearTimeout(initialFetch);
  }, [fetchQr]);

  const qrToken = qr?.token;
  const qrExpiresAt = qr?.expiresAt;
  React.useEffect(() => {
    if (!qrExpiresAt) return;

    const tick = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((new Date(qrExpiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(left);
      if (left <= 0) {
        void fetchQr();
      }
    }, 500);

    const poll = window.setInterval(() => {
      void fetchQr();
    }, 1_000);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [qrToken, qrExpiresAt, fetchQr]);

  async function handleRotate() {
    setRotating(true);
    await fetchQr(true);
    toast.success("QR обновлён");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0c0e12] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 35%, rgba(233,140,85,0.12), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(80,120,180,0.12), transparent)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/45">
          Mebel Demo · Цех
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
          Сканируйте для отметки прихода
        </h1>

        <div className="mt-10 rounded-3xl bg-white p-5 shadow-[0_0_80px_rgba(233,140,85,0.12)] sm:p-7">
          {loading && !qr ? (
            <div className="flex h-[min(70vw,420px)] w-[min(70vw,420px)] items-center justify-center">
              <Loader2 className="size-10 animate-spin text-neutral-400" />
            </div>
          ) : qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr.qrDataUrl}
              alt="QR-код для отметки прихода"
              className="h-[min(70vw,420px)] w-[min(70vw,420px)]"
            />
          ) : (
            <div className="flex h-[min(70vw,420px)] w-[min(70vw,420px)] items-center justify-center text-neutral-500">
              Нет QR
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-white/50">Обновление через</p>
          <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-primary sm:text-6xl">
            {String(secondsLeft).padStart(2, "0")}
            <span className="ml-1 text-2xl text-white/40">сек</span>
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-10 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          disabled={rotating}
          onClick={() => void handleRotate()}
        >
          {rotating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Обновить сейчас
        </Button>
      </div>
    </div>
  );
}
