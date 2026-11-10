"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallBanner({ appName = "Mebel Demo" }: { appName?: string }) {
  const dismissKey = `pwa-install-dismissed:${appName}`;
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(dismissKey) === "1") return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [dismissKey]);

  if (!visible || !deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (choice.outcome === "dismissed") {
      localStorage.setItem(dismissKey, "1");
    }
  }

  function dismiss() {
    localStorage.setItem(dismissKey, "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-lg border border-border bg-panel p-3 shadow-lg sm:bottom-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Download className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Установить {appName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Приложение откроется сразу в {appName}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" type="button" onClick={install}>
              Установить
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={dismiss}>
              Позже
            </Button>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={dismiss}
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
