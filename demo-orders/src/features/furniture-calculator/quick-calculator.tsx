"use client";

import { FileText, Save } from "lucide-react";
import type { FurnitureCalculationMode, FurnitureQuoteSnapshot, FurnitureQuickTariff } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKzt } from "@/lib/utils";
import { calculateQuickFurnitureEstimate, QUICK_TARIFFS } from "@/lib/domain/furniture/quote";
import { CalculatorSectionLayout, CalculatorSortableSection } from "@/components/calculator/sortable-sections";

type ClientOpt = { id: string; fullName: string; phone: string; address?: string | null };

export function QuickCalculator({
  clients,
  quote,
  canWrite,
  pending,
  orderId,
  companyName,
  onPatch,
  onModeChange,
  onSubmit,
  onNew,
}: {
  clients: ClientOpt[];
  quote: FurnitureQuoteSnapshot;
  canWrite: boolean;
  pending: boolean;
  orderId: string | null;
  companyName: string;
  onPatch: (patch: Partial<FurnitureQuoteSnapshot>) => void;
  onModeChange: (mode: FurnitureCalculationMode) => void;
  onSubmit: (action: "draft" | "proposal") => void;
  onNew: () => void;
}) {
  const quick = quote.quickEstimate ?? { linearMeters: 0, heightMeters: 2.5, tariff: "ldsp_budget" as const };
  const estimate = calculateQuickFurnitureEstimate(quick);
  const empty = estimate.linearMeters <= 0;
  const updateQuick = (patch: Partial<typeof quick>) => onPatch({ quickEstimate: { ...quick, ...patch } });
  const pickClient = (id: string) => {
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    onPatch({
      clientId: client.id,
      clientName: client.fullName,
      clientPhone: client.phone,
      address: client.address ?? quote.address,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{companyName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Калькулятор мебели</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ориентировочная цена корпусной мебели по погонному метру</p>
        </div>
        {canWrite && (
          <button type="button" onClick={onNew} className="text-sm text-muted-foreground hover:text-foreground">
            Новый расчёт
          </button>
        )}
      </div>

      <div className="inline-flex rounded-md bg-canvas p-1" role="radiogroup" aria-label="Режим расчёта">
        <button type="button" role="radio" aria-checked className="min-h-10 rounded-sm bg-panel px-4 text-sm font-medium text-foreground dark:bg-foreground/[0.1]">
          Быстрый расчёт
        </button>
        <button type="button" role="radio" aria-checked={false} onClick={() => onModeChange("detailed")} className="min-h-10 rounded-sm px-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          Детальный расчёт
        </button>
      </div>

      <CalculatorSectionLayout storageKey="calculator-section-order:furniture-quick" ids={["client", "parameters", "total"]}>
      <CalculatorSortableSection id="client">
      <section id="client" className="calculator-block scroll-mt-28 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">Клиент и проект</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Из базы</Label>
            <Select value={quote.clientId ?? ""} onValueChange={pickClient} disabled={!canWrite}>
              <SelectTrigger><SelectValue placeholder="Выбрать клиента…" /></SelectTrigger>
              <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.fullName} · {client.phone}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="quick-project">Проект</Label>
            <Input id="quick-project" value={quote.projectName} disabled={!canWrite} placeholder="Кухня, шкаф…" onChange={(event) => onPatch({ projectName: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="quick-name">Имя</Label>
            <Input id="quick-name" value={quote.clientName} disabled={!canWrite} onChange={(event) => onPatch({ clientName: event.target.value, clientId: null })} />
          </div>
          <div>
            <Label htmlFor="quick-phone">Телефон</Label>
            <Input id="quick-phone" type="tel" value={quote.clientPhone} disabled={!canWrite} onChange={(event) => onPatch({ clientPhone: event.target.value })} />
          </div>
        </div>
      </section>
      </CalculatorSortableSection>

      <CalculatorSortableSection id="parameters">
      <section id="parameters" className="calculator-block scroll-mt-28 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">Параметры изделия</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Тариф</Label>
            <Select value={quick.tariff} disabled={!canWrite} onValueChange={(value) => updateQuick({ tariff: value as FurnitureQuickTariff })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(QUICK_TARIFFS).map(([key, tariff]) => <SelectItem key={key} value={key}>{tariff.label} · {formatKzt(tariff.baseRate)}/п.м.</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="quick-length">Длина, п.м.</Label>
            <Input id="quick-length" type="number" inputMode="decimal" min={0} step={0.01} disabled={!canWrite} value={quick.linearMeters || ""} onChange={(event) => updateQuick({ linearMeters: Number(event.target.value) || 0 })} />
          </div>
          <div>
            <Label htmlFor="quick-height">Высота, м</Label>
            <Input id="quick-height" type="number" inputMode="decimal" min={0} step={0.01} disabled={!canWrite} value={quick.heightMeters || ""} onChange={(event) => updateQuick({ heightMeters: Number(event.target.value) || 0 })} />
          </div>
          <div>
            <Label htmlFor="quick-discount">Скидка, %</Label>
            <Input id="quick-discount" type="number" min={0} max={100} disabled={!canWrite} value={quote.discountPercent || ""} onChange={(event) => onPatch({ discountPercent: Number(event.target.value) || 0 })} />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          До 2,50 м доплаты нет. {estimate.heightSteps > 0 ? `Высота добавляет ${estimate.heightSteps} ${estimate.heightSteps === 1 ? "шаг" : "шага"} по 10 см.` : ""}
        </p>
      </section>
      </CalculatorSortableSection>

      <CalculatorSortableSection id="total">
      <section id="total" className="calculator-block scroll-mt-28 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Цена для клиента</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{formatKzt(quote.total)}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-canvas p-3"><dt className="text-xs text-muted-foreground">Ставка</dt><dd className="mt-1 font-semibold tabular-nums">{formatKzt(estimate.rate)}/п.м.</dd></div>
          <div className="rounded-md bg-canvas p-3"><dt className="text-xs text-muted-foreground">До скидки</dt><dd className="mt-1 font-semibold tabular-nums">{formatKzt(estimate.subtotal)}</dd></div>
          <div className="rounded-md bg-canvas p-3"><dt className="text-xs text-muted-foreground">Скидка</dt><dd className="mt-1 font-semibold tabular-nums">{quote.discountPercent}% · {formatKzt(quote.discountAmount)}</dd></div>
        </dl>
        {canWrite && <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" disabled={pending || empty} onClick={() => onSubmit("proposal")}><FileText /> Сформировать КП</Button>
          <Button type="button" variant="secondary" disabled={pending || empty} onClick={() => onSubmit("draft")}><Save /> {orderId ? "Обновить заказ" : "Сохранить в заказ"}</Button>
        </div>}
        {orderId && <p className="mt-3 text-xs text-muted-foreground">Расчёт привязан к заказу · <a className="text-primary hover:underline" href={`/orders/${orderId}`}>открыть</a></p>}
      </section>
      </CalculatorSortableSection>
      </CalculatorSectionLayout>
    </div>
  );
}
