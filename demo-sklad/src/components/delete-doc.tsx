"use client";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useRun } from "@/components/use-run";

type Res = { ok: true; data: unknown } | { ok: false; error: string };

/** Удаление документа с подтверждением (право «Удалять документы» проверяется на сервере) */
export function DeleteDocButton({ action, id, redirect, label }: { action: (i: { id: number }) => Promise<Res>; id: number; redirect: string; label: string }) {
  const router = useRouter();
  const { pending, run } = useRun();
  return (
    <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} loading={pending}
      onClick={() => confirm(`Удалить ${label}? Остатки и долги пересчитаются. Действие попадёт в журнал.`) && run(() => action({ id }), { success: "Удалено", onOk: () => router.replace(redirect) })}>
      Удалить
    </Button>
  );
}
