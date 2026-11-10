"use client";
import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Card, CardHeader, Checkbox, Field, Select, buttonClass } from "@/components/ui";
import { Link2 } from "lucide-react";
import { ShareButtons } from "@/components/share";
import { useRun } from "@/components/use-run";
import { Button } from "@/components/ui";
import { priceListLinkAction } from "@/modules/prices/actions";

/** Сборка прайс-листа: тип цены (Базар / Магазин …), папка, только в наличии */
export function PriceListBuilder({ types, folders }: { types: { id: number; name: string }[]; folders: { id: number; path: string }[] }) {
  const [type, setType] = useState(types[0]?.id ?? 0);
  const [folder, setFolder] = useState<number | "">("");
  const [inStock, setInStock] = useState(false);
  const [stockCol, setStockCol] = useState(true);
  const qs = new URLSearchParams({ type: String(type), ...(folder ? { folder: String(folder) } : {}), ...(inStock ? { instock: "1" } : {}), ...(stockCol ? { stock: "1" } : {}) });
  const name = types.find((t) => t.id === type)?.name ?? "";
  const [link, setLink] = useState<{ key: string; url: string } | null>(null);
  const { pending, run } = useRun();
  const key = qs.toString();
  return (
    <Card>
      <CardHeader title="Прайс-лист" subtitle="PDF для печати и отправки клиенту, Excel — для правок" />
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Цены"><Select value={type} onChange={(e) => setType(Number(e.target.value))}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Папка"><Select value={folder} onChange={(e) => setFolder(e.target.value ? Number(e.target.value) : "")}><option value="">Весь каталог</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}</Select></Field>
        <Checkbox checked={inStock} onChange={setInStock} label="Только товары в наличии" />
        <Checkbox checked={stockCol} onChange={setStockCol} label="Колонка «Наличие»" />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line p-4 sm:px-5">
        <a href={`/api/pdf/pricelist?${qs}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}><FileDown className="size-4" />PDF</a>
        <a href={`/api/pdf/pricelist?${qs}&format=xlsx`} className={buttonClass("secondary")}><FileSpreadsheet className="size-4" />Excel</a>
        <span className="flex-1" />
        {link?.key === key
          ? <ShareButtons url={link.url} text={`Прайс-лист Electro Demo (${name})`} entity="pricelist" />
          : <Button variant="ghost" icon={<Link2 className="size-4" />} loading={pending} onClick={() => run(() => priceListLinkAction({ type, folder: folder || null, instock: inStock, stock: stockCol }), { refresh: false, onOk: (url) => setLink({ key, url }) })}>Ссылка для клиента</Button>}
      </div>
      <p className="px-4 pb-4 text-xs text-ink-3 sm:px-5">Ссылка для клиента открывает PDF без входа и действует 30 дней. Закупочные цены в прайс не попадают.</p>
    </Card>
  );
}
