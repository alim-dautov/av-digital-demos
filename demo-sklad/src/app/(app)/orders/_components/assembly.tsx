"use client";
import { useOptimistic, useState, useTransition } from "react";
import { Camera, CheckCircle2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button, Card, Progress, cn } from "@/components/ui";
import { Attachments, type FileRef } from "@/components/file-upload";
import { num } from "@/lib/format";
import { finishAssemblyAction, setItemAssembledAction } from "@/modules/orders/actions";

type Item = { id: number; name: string; sku: string | null; unit: string; qty: number; stock: number; assembled: boolean };

/** Режим сборщика: крупные чекбоксы, фото собранного, «Собрано» */
export function AssemblyView({ orderId, items, done, photos: initPhotos }: { orderId: number; items: Item[]; done: boolean; photos: FileRef[] }) {
  const router = useRouter();
  const [state, setState] = useOptimistic(items, (s, a: { id: number; v: boolean }) => s.map((i) => (i.id === a.id ? { ...i, assembled: a.v } : i)));
  const [, start] = useTransition();
  const [finishing, startFinish] = useTransition();
  const [photos, setPhotos] = useState<FileRef[]>([]);
  const count = state.filter((i) => i.assembled).length;
  const toggle = (it: Item) => start(async () => {
    setState({ id: it.id, v: !it.assembled });
    const r = await setItemAssembledAction({ itemId: it.id, assembled: !it.assembled });
    if (!r.ok) toast.error(r.error);
    router.refresh();
  });
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold"><span>Собрано {count} из {state.length}</span>{done && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-4" />Заявка собрана</span>}</div>
        <Progress value={(count / Math.max(1, state.length)) * 100} tone={count === state.length ? "success" : "yellow"} />
      </Card>
      <ul className="flex flex-col gap-2">
        {state.map((it) => (
          <li key={it.id}>
            <button type="button" onClick={() => toggle(it)} className={cn("flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-150 active:scale-[0.99]",
              it.assembled ? "border-success bg-success-bg" : "border-line bg-surface")}>
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border-2", it.assembled ? "border-success bg-success text-white" : "border-line-strong")}>{it.assembled && <CheckCircle2 className="size-6" />}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[15px] font-bold leading-snug", it.assembled && "text-ink-2 line-through decoration-2")}>{it.name}</span>
                <span className={cn("text-xs", it.stock < it.qty ? "font-semibold text-danger" : "text-ink-3")}>{it.sku ? `${it.sku} · ` : ""}на складе {num(it.stock)} {it.unit}</span>
              </span>
              <span className="tnum shrink-0 text-right text-2xl font-extrabold">{num(it.qty)}<span className="ml-1 text-sm font-semibold text-ink-3">{it.unit}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <Card className="flex flex-col gap-3 p-4">
        <p className="flex items-center gap-2 text-sm font-bold"><Camera className="size-4" />Фото собранной заявки</p>
        {initPhotos.length > 0 && <Attachments value={initPhotos} onChange={() => {}} images max={0} />}
        <Attachments value={photos} onChange={setPhotos} images max={6} label="Сфотографировать" accept="image/*" />
        <Button variant="accent" size="lg" icon={<PackageCheck className="size-5" />} loading={finishing} disabled={done && !photos.length}
          onClick={() => startFinish(async () => {
            const r = await finishAssemblyAction({ id: orderId, photos });
            if (!r.ok) { toast.error(r.error); return; }
            toast.success("Заявка отмечена собранной, менеджер получит уведомление");
            setPhotos([]);
            router.refresh();
          })}>{done ? "Добавить фото" : "Собрано"}</Button>
      </Card>
    </div>
  );
}
