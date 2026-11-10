"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildAtelierProposalDocument, recalculateAtelierQuote } from "@/lib/domain/atelier-calc";
import type { CompanyLogo } from "@/lib/company-apps";
import type { AtelierQuoteSnapshot } from "@/types";
import { MeasurementSheet } from "./measurement-sheet";
import { readCalcResult, writeCalcResult } from "./result-storage";

export function AtelierResult({
  canWrite,
  logo,
}: {
  canWrite: boolean;
  logo: CompanyLogo["full"] | null;
}) {
  const router = useRouter();
  const stored = readCalcResult();
  const [quote, setQuote] = useState<AtelierQuoteSnapshot | null>(() =>
    stored ? recalculateAtelierQuote(stored.quote) : null,
  );
  const companyName = stored?.companyName ?? "Шторы Демо";
  const [measurementId, setMeasurementId] = useState<string | null>(
    stored?.measurementId ?? null,
  );
  const [pending, setPending] = useState<"draft" | "sheet" | null>(null);

  function updateQuote(next: AtelierQuoteSnapshot) {
    const calculated = recalculateAtelierQuote(next);
    setQuote(calculated);
    writeCalcResult({ quote: calculated, companyName, measurementId });
  }

  async function save(kind: "draft" | "sheet") {
    if (!quote || !canWrite) return;
    setPending(kind);
    try {
      const res = await fetch("/api/atelier/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: measurementId, quote, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить");
      const savedQuote = recalculateAtelierQuote(data.quote ?? data.measurement.quote);
      setQuote(savedQuote);
      setMeasurementId(data.measurement.id);
      writeCalcResult({
        quote: savedQuote,
        companyName,
        measurementId: data.measurement.id,
      });
      if (kind === "draft") {
        toast.success("Черновик замера сохранён в карточке клиента");
        router.push(`/clients/${data.measurement.clientId}`);
        return;
      }
      router.push(`/measurements/${data.measurement.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setPending(null);
    }
  }

  if (!quote) {
    return (
      <div className="rounded-lg border border-border bg-panel p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Расчёт</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Сначала заполните калькулятор и нажмите «Рассчитать».
        </p>
        <Button className="mt-4" asChild>
          <Link href="/calculator">К калькулятору</Link>
        </Button>
      </div>
    );
  }

  const document = buildAtelierProposalDocument(quote);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{companyName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Расчёт</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href="/calculator">Изменить параметры</Link>
        </Button>
      </div>

      <div className="no-print max-w-xs">
        <Label>Скидка</Label>
        <Select
          value={String(quote.discountPercent)}
          disabled={!canWrite || pending !== null}
          onValueChange={(value) => updateQuote({ ...quote, discountPercent: Number(value) })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 5, 10, 15, 20].map((discount) => (
              <SelectItem key={discount} value={String(discount)}>
                {discount === 0 ? "Без скидки" : `${discount}%`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <MeasurementSheet
        companyName={companyName}
        logo={logo}
        clientName={quote.clientName}
        clientPhone={quote.clientPhone}
        address={quote.address}
        deadline={quote.deadline || null}
        document={document}
      />

      {canWrite ? (
        <div className="no-print flex flex-wrap gap-2">
          <Button type="button" disabled={pending !== null} onClick={() => void save("draft")}>
            {pending === "draft" ? "Сохранение…" : "Сохранить черновик"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void save("sheet")}
          >
            {pending === "sheet" ? "Формирование…" : "Сформировать КП"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
