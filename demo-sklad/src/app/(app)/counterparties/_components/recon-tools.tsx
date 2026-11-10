"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, FileDown, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Select, buttonClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { reconLinkAction } from "@/modules/counterparties/actions";

export function ReconTools({ cpId, from, to, side, phone, name, closing }: { cpId: number; from: string; to: string; side: "client" | "supplier"; phone: string; name: string; closing: string }) {
  const router = useRouter();
  const [f, setF] = useState({ from, to, side });
  const { pending, run } = useRun();
  const qs = new URLSearchParams({ from, to, side }).toString();
  const link = async () => run(() => reconLinkAction({ id: cpId, from, to, side }), { refresh: false });
  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5">
      <form className="grid grid-cols-2 gap-2 sm:grid-cols-[150px_150px_200px_auto]" onSubmit={(e) => { e.preventDefault(); router.push(`/counterparties/${cpId}?tab=recon&${new URLSearchParams(f)}`); }}>
        <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="С" />
        <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="По" />
        <Select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value as "client" })} aria-label="Сторона"><option value="client">как с клиентом</option><option value="supplier">как с поставщиком</option></Select>
        <Button type="submit">Показать</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/pdf/recon/${cpId}?${qs}`} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}><FileDown className="size-4" />PDF</a>
        <Button size="sm" icon={<Copy className="size-4" />} loading={pending} onClick={async () => {
          const url = await link();
          if (url) { await navigator.clipboard.writeText(url).catch(() => {}); toast.success("Ссылка скопирована (действует 30 дней)"); }
        }}>Ссылка для клиента</Button>
        <Button size="sm" icon={<MessageCircle className="size-4" />} disabled={pending} onClick={async () => {
          const url = await link();
          if (!url) return;
          const text = `Здравствуйте! Акт сверки ${name} на ${to.split("-").reverse().join(".")}: ${closing}. ${url}`;
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        }}>Отправить в WhatsApp</Button>
      </div>
    </div>
  );
}
