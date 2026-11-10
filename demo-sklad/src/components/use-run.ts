"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { notifyDataChanged } from "@/lib/search/client";

type Res<T> = { ok: true; data: T } | { ok: false; error: string };

/** Запуск серверного действия: индикатор, тост с ошибкой/успехом, обновление страницы */
export function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = <T,>(fn: () => Promise<Res<T>>, opts: { success?: string | ((d: T) => string); onOk?: (d: T) => void; refresh?: boolean } = {}) =>
    new Promise<T | null>((resolve) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) { toast.error(r.error); resolve(null); return; }
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r.data) : opts.success);
        opts.onOk?.(r.data);
        notifyDataChanged(); // поисковый индекс подтянет изменения
        if (opts.refresh !== false) router.refresh();
        resolve(r.data);
      }),
    );
  return { pending, run };
}
