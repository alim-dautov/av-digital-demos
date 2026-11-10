"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { importProductsAction, rollbackBatchAction } from "@/modules/products/actions";

export function RollbackButton({ id, label, count }: { id: number; label: string; count: number }) {
  const { pending, run } = useRun();
  return (
    <Button variant="ghost" icon={<Undo2 className="size-4" />} loading={pending} title={label}
      onClick={() => confirm(`Откатить последнюю массовую смену цен?\n\n${label}\nИзменений: ${count}`) && run(() => rollbackBatchAction({ id }), { success: (d) => `Откат выполнен: ${d.count} цен` })}>
      Откатить цены
    </Button>
  );
}

type Res = { created: number; updated: number; skipped: number; errors: string[]; dryRun: boolean };

export function ImportButton() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const send = (dry: boolean) => start(async () => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    if (dry) fd.set("dryRun", "1");
    const r = await importProductsAction(fd);
    if (!r.ok) { toast.error(r.error); return; }
    setRes(r.data);
    if (!dry) { toast.success(`Импорт: создано ${r.data.created}, обновлено ${r.data.updated}`); router.refresh(); setOpen(false); setFile(null); setRes(null); }
  });
  return (
    <>
      <Button icon={<Upload className="size-4" />} onClick={() => setOpen(true)}>Импорт</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Импорт товаров из Excel"
        footer={<><Button onClick={() => setOpen(false)}>Отмена</Button>
          {!res ? <Button variant="primary" disabled={!file} loading={pending} onClick={() => send(true)}>Проверить</Button>
            : <Button variant="accent" loading={pending} onClick={() => send(false)}>Импортировать</Button>}</>}>
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-ink-2">Первая строка — заголовки: <b>Название</b> (обязательно), Артикул, Штрихкод, Ед., Папка («Вектор / Кабель ВВГ»), Мин. остаток и колонки с названиями типов цен. Товар ищется по артикулу, затем по названию. Удобно начать с выгрузки «Excel».</p>
          <button type="button" onClick={() => ref.current?.click()} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong p-4 text-ink-3 transition-colors hover:border-yellow hover:text-ink">
            <FileSpreadsheet className="size-7" />
            {file ? <span className="font-semibold text-ink">{file.name}</span> : "Выберите файл .xlsx"}
          </button>
          <input ref={ref} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
          {res && (
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="font-semibold">Будет создано: {res.created}, обновлено: {res.updated}, пропущено пустых: {res.skipped}</p>
              {res.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-danger">{res.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
