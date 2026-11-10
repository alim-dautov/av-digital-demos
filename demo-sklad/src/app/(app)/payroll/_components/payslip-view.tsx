import Link from "next/link";
import { FileDown, Lock, Target } from "lucide-react";
import { money, pct } from "@/lib/format";
import { Badge, Card, CardHeader, Progress, buttonClass } from "@/components/ui";
import type { Payslip } from "@/modules/payroll/types";

type Slip = Payslip & { closed: boolean; closedAt: Date | null };

/** Расчётный лист: строки начислений с раскрытием деталей (<details> — без JS) */
export function PayslipView({ slip, name, pdfHref, xlsxHref }: { slip: Slip; name: string; pdfHref?: string; xlsxHref?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Начислено" value={money(slip.accrued)} />
        <Tile label="Аванс" value={money(slip.advances)} />
        <Tile label="Выплачено" value={money(slip.payouts)} />
        <Tile label={slip.balanceAfterPayouts < 0 ? "Переплата" : "К выплате"} value={money(slip.balanceAfterPayouts)} accent={slip.balanceAfterPayouts > 0} danger={slip.balanceAfterPayouts < 0} />
      </div>
      {slip.planProgressPct > 0 && (
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><Target className="size-4 text-info" />План продаж</span><b className="tnum">{pct(slip.planProgressPct)}</b></div>
          <Progress value={slip.planProgressPct} tone={slip.planProgressPct >= 100 ? "success" : "yellow"} />
          {slip.nextTier && <p className="mt-2 text-xs text-ink-3">До ставки {(slip.nextTier.rateBp / 100).toString().replace(".", ",")}% осталось продать <b className="text-ink">{money(slip.nextTier.remaining)}</b> (порог {pct(slip.nextTier.atPct)})</p>}
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader title={`Расчётный лист · ${name}`} subtitle={slip.period.label}
          action={<div className="flex items-center gap-2">
            {slip.closed && <Badge tone="neutral"><Lock className="mr-1 inline size-3" />период закрыт</Badge>}
            {pdfHref && <a href={pdfHref} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}><FileDown className="size-4" />PDF</a>}
            {xlsxHref && <a href={xlsxHref} className={buttonClass("ghost", "sm")}>Excel</a>}
          </div>} />
        <ul className="divide-y divide-line">
          {slip.lines.map((l) => (
            <li key={l.code + l.label}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                  <span className="text-sm font-semibold"><span className="mr-2 inline-block text-ink-3 transition-transform group-open:rotate-90">›</span>{l.label}</span>
                  <b className={`tnum ${l.amount < 0 ? "text-danger" : ""}`}>{money(l.amount)}</b>
                </summary>
                {l.details.length > 0 && (
                  <ul className="bg-surface-2/50 px-4 pb-3 sm:px-5">
                    {l.details.map((d, i) => (
                      <li key={i} className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-xs last:border-0">
                        <span className="min-w-0">{d.ref ? <Link href={d.ref} className="hover:underline">{d.label}</Link> : d.label}{d.note && <span className="text-ink-3"> · {d.note}</span>}</span>
                        {d.amount != null && <span className="tnum shrink-0">{money(d.amount)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </li>
          ))}
          {!slip.lines.length && <li className="px-5 py-6 text-sm text-ink-3">Нет начислений — проверьте схему оплаты сотрудника</li>}
          {slip.carryIn !== 0 && <li className="flex justify-between px-4 py-3 text-sm sm:px-5"><span>Перенос с прошлого периода</span><b className="tnum">{money(slip.carryIn)}</b></li>}
          <li className="flex justify-between bg-surface-2 px-4 py-3 sm:px-5"><span className="font-bold">Итого начислено</span><b className="tnum text-lg">{money(slip.accrued)}</b></li>
        </ul>
        {slip.notes.length > 0 && <ul className="border-t border-line px-4 py-3 text-xs text-ink-3 sm:px-5">{slip.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>}
      </Card>
    </div>
  );
}

function Tile({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-yellow bg-yellow/10" : danger ? "border-danger/40 bg-danger-bg/40" : "border-line bg-surface"}`}>
      <p className="text-xs text-ink-3">{label}</p><p className="tnum mt-1 text-xl font-extrabold">{value}</p>
    </div>
  );
}

/** Последние ключи периодов для выбора */
export function recentPeriodKeys(kind: "month" | "half" | "week", keyOf: (k: "month" | "half" | "week", d: string) => string, todayIso: string, n = 8) {
  const res: string[] = [];
  const d = new Date(todayIso + "T00:00:00Z");
  for (let i = 0; i < 400 && res.length < n; i++) {
    const k = keyOf(kind, new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10));
    if (!res.includes(k)) res.push(k);
  }
  return res;
}
