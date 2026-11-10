"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Save } from "lucide-react";
import type { RenovationItemLine, RenovationQuoteSnapshot } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatKzt } from "@/lib/utils";
import { CalculatorSectionLayout, CalculatorSortableSection } from "@/components/calculator/sortable-sections";
import {
  RENOVATION_BLOCKS,
  RENOVATION_SECTION_LABELS,
  RENOVATION_WORK_STAGES,
  type RenovationSectionKey,
} from "@/lib/domain/renovation/catalog";
import {
  blockSubtotal,
  emptyRenovationQuote,
  enabledRenovationItems,
  normalizeRenovationQuote,
} from "@/lib/domain/renovation/quote";

type ClientOpt = {
  id: string;
  fullName: string;
  phone: string;
  address?: string | null;
};

type Props = {
  clients: ClientOpt[];
  canWrite: boolean;
  companyName: string;
  initialOrderId?: string | null;
  initialQuote?: RenovationQuoteSnapshot | null;
};

const SECTIONS: RenovationSectionKey[] = ["interior", "house"];

function patchItem(
  quote: RenovationQuoteSnapshot,
  blockId: string,
  itemId: string,
  patch: Partial<RenovationItemLine>,
): RenovationQuoteSnapshot {
  return normalizeRenovationQuote({
    ...quote,
    blocks: quote.blocks.map((b) =>
      b.id !== blockId
        ? b
        : {
            ...b,
            items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
          },
    ),
  });
}

function setBlockItemsEnabled(
  quote: RenovationQuoteSnapshot,
  blockId: string,
  enabled: boolean,
): RenovationQuoteSnapshot {
  return normalizeRenovationQuote({
    ...quote,
    blocks: quote.blocks.map((b) =>
      b.id !== blockId
        ? b
        : {
            ...b,
            items: b.items.map((i) => ({
              ...i,
              enabled,
              ...(enabled ? {} : { price: i.price, comment: i.comment }),
            })),
          },
    ),
  });
}

export function RenovationCalculator({
  clients,
  canWrite,
  companyName,
  initialOrderId = null,
  initialQuote = null,
}: Props) {
  const [quote, setQuote] = useState(() =>
    normalizeRenovationQuote(initialQuote ?? emptyRenovationQuote()),
  );
  const [orderId, setOrderId] = useState<string | null>(initialOrderId);
  const [pending, setPending] = useState(false);

  const enabled = useMemo(() => enabledRenovationItems(quote), [quote]);

  const summaryByBlock = useMemo(() => {
    return quote.blocks
      .map((block) => {
        const def = RENOVATION_BLOCKS.find((d) => d.id === block.id);
        const items = block.items.filter((i) => i.enabled);
        if (items.length === 0 || !def) return null;
        return {
          id: block.id,
          title: def.title,
          subtotal: blockSubtotal(block),
          items: items.map((i) => ({
            id: i.id,
            label: def.items.find((d) => d.id === i.id)?.label ?? i.id,
            price: i.price,
          })),
        };
      })
      .filter(Boolean) as {
      id: string;
      title: string;
      subtotal: number;
      items: { id: string; label: string; price: number }[];
    }[];
  }, [quote.blocks]);

  function selectClient(id: string) {
    if (id === "__new__") {
      setQuote((q) =>
        normalizeRenovationQuote({
          ...q,
          clientId: null,
          clientName: "",
          clientPhone: "",
          address: "",
        }),
      );
      return;
    }
    const client = clients.find((c) => c.id === id);
    if (!client) return;
    setQuote((q) =>
      normalizeRenovationQuote({
        ...q,
        clientId: client.id,
        clientName: client.fullName,
        clientPhone: client.phone,
        address: client.address ?? q.address,
      }),
    );
  }

  async function submit(action: "draft" | "proposal") {
    if (!canWrite) return;
    setPending(true);
    try {
      const res = await fetch("/api/renovation/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, quote, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      if (data.quote) setQuote(normalizeRenovationQuote(data.quote));
      if (data.order?.id) {
        setOrderId(data.order.id);
        window.history.replaceState(null, "", `/calculator?order=${data.order.id}`);
      }
      if (action === "draft") toast.success(`Сохранено в заказ №${data.order.number}`);
      if (action === "proposal" && data.pdfUrl) {
        toast.success(`${data.proposal.number} готово`);
        window.open(data.pdfUrl, "_blank");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  function startNew() {
    setOrderId(null);
    setQuote(emptyRenovationQuote());
    window.history.replaceState(null, "", "/calculator");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{companyName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Калькулятор ремонта
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Соберите смету по пунктам — каждый можно включить, оценить и прокомментировать
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={startNew}
            className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Новый расчёт
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <CalculatorSectionLayout storageKey="calculator-section-order:renovation" ids={["client", ...SECTIONS, "work-stages"]}>
          <CalculatorSortableSection id="client">
          <section id="client" className="scroll-mt-28 space-y-4 rounded-lg border border-border bg-panel-elevated p-4">
            <p className="text-sm font-semibold">Клиент и объект</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Клиент</Label>
                <Select
                  value={quote.clientId ?? "__new__"}
                  onValueChange={selectClient}
                  disabled={!canWrite}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите или введите" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">Новый клиент</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ren-name">ФИО</Label>
                <Input
                  id="ren-name"
                  value={quote.clientName}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setQuote((q) => normalizeRenovationQuote({ ...q, clientName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ren-phone">Телефон</Label>
                <Input
                  id="ren-phone"
                  value={quote.clientPhone}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setQuote((q) =>
                      normalizeRenovationQuote({ ...q, clientPhone: e.target.value }),
                    )
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ren-address">Адрес объекта</Label>
                <Input
                  id="ren-address"
                  value={quote.address}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setQuote((q) => normalizeRenovationQuote({ ...q, address: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ren-project">Название проекта</Label>
                <Input
                  id="ren-project"
                  value={quote.projectName}
                  disabled={!canWrite}
                  placeholder="Например, дом на Абая"
                  onChange={(e) =>
                    setQuote((q) =>
                      normalizeRenovationQuote({ ...q, projectName: e.target.value }),
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ren-deadline">Срок</Label>
                <Input
                  id="ren-deadline"
                  type="date"
                  value={quote.deadline}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setQuote((q) => normalizeRenovationQuote({ ...q, deadline: e.target.value }))
                  }
                />
              </div>
            </div>
          </section>
          </CalculatorSortableSection>

          {SECTIONS.map((section) => {
            const blocks = RENOVATION_BLOCKS.filter((b) => b.section === section);
            return (
              <CalculatorSortableSection key={section} id={section}>
              <section id={section} className="scroll-mt-28 space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  {RENOVATION_SECTION_LABELS[section]}
                </h2>
                <div className="space-y-3">
                  {blocks.map((def) => {
                    const block = quote.blocks.find((b) => b.id === def.id)!;
                    const onCount = block.items.filter((i) => i.enabled).length;
                    const subtotal = blockSubtotal(block);
                    const active = onCount > 0;
                    return (
                      <article
                        key={def.id}
                        className={cn(
                          "overflow-hidden rounded-lg border border-border bg-panel-elevated transition-colors",
                          active && "border-primary/35",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium">{def.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              {onCount} из {def.items.length}
                              {active ? ` · ${formatKzt(subtotal)}` : ""}
                            </p>
                          </div>
                          {canWrite && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                                onClick={() =>
                                  setQuote((q) => setBlockItemsEnabled(q, def.id, true))
                                }
                              >
                                Все
                              </button>
                              <button
                                type="button"
                                className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                                onClick={() =>
                                  setQuote((q) => setBlockItemsEnabled(q, def.id, false))
                                }
                              >
                                Сбросить
                              </button>
                            </div>
                          )}
                        </div>

                        <ul className="divide-y divide-border/70">
                          {def.items.map((itemDef) => {
                            const line = block.items.find((i) => i.id === itemDef.id)!;
                            return (
                              <li
                                key={itemDef.id}
                                className={cn(
                                  "px-4 py-3 transition-colors",
                                  line.enabled && "bg-primary/[0.04]",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id={`item-${itemDef.id}`}
                                    checked={line.enabled}
                                    disabled={!canWrite}
                                    className="mt-0.5"
                                    onCheckedChange={(checked) =>
                                      setQuote((q) =>
                                        patchItem(q, def.id, itemDef.id, {
                                          enabled: checked === true,
                                        }),
                                      )
                                    }
                                  />
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <label
                                      htmlFor={`item-${itemDef.id}`}
                                      className={cn(
                                        "block cursor-pointer text-sm leading-snug",
                                        line.enabled
                                          ? "font-medium text-foreground"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {itemDef.label}
                                    </label>
                                    {line.enabled && (
                                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                                        <Input
                                          value={line.comment}
                                          disabled={!canWrite}
                                          placeholder="Комментарий"
                                          className="h-9"
                                          onChange={(e) =>
                                            setQuote((q) =>
                                              patchItem(q, def.id, itemDef.id, {
                                                comment: e.target.value,
                                              }),
                                            )
                                          }
                                        />
                                        <Input
                                          type="number"
                                          min={0}
                                          inputMode="numeric"
                                          value={line.price || ""}
                                          disabled={!canWrite}
                                          placeholder="Цена, ₸"
                                          className="h-9 tabular-nums"
                                          aria-label={`Цена: ${itemDef.label}`}
                                          onChange={(e) =>
                                            setQuote((q) =>
                                              patchItem(q, def.id, itemDef.id, {
                                                price: Number(e.target.value) || 0,
                                              }),
                                            )
                                          }
                                        />
                                      </div>
                                    )}
                                  </div>
                                  {line.enabled && (
                                    <span className="hidden shrink-0 pt-0.5 text-sm font-medium tabular-nums text-foreground sm:block">
                                      {formatKzt(line.price)}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              </section>
              </CalculatorSortableSection>
            );
          })}

          <CalculatorSortableSection id="work-stages">
          <section id="work-stages" className="scroll-mt-28 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm font-semibold">Порядок работ</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Печатается в КП без отдельной цены
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {RENOVATION_WORK_STAGES.map((stage) => (
                <li key={stage}>{stage}</li>
              ))}
            </ol>
          </section>
          </CalculatorSortableSection>
        </CalculatorSectionLayout>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-5 rounded-lg border border-border bg-panel-elevated p-4">
            <div>
              <p className="text-xs text-muted-foreground">Полный расчёт</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                {formatKzt(quote.total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Включено пунктов: {enabled.length}
              </p>
            </div>

            {summaryByBlock.length > 0 && (
              <div className="max-h-72 space-y-3 overflow-y-auto text-sm">
                {summaryByBlock.map((block) => (
                  <div key={block.id}>
                    <div className="flex justify-between gap-2 font-medium">
                      <span className="truncate">{block.title}</span>
                      <span className="shrink-0 tabular-nums">{formatKzt(block.subtotal)}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {block.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-2">
                          <span className="min-w-0 truncate">{item.label}</span>
                          <span className="shrink-0 tabular-nums">{formatKzt(item.price)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {canWrite && (
              <div className="grid gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  disabled={pending || enabled.length === 0}
                  onClick={() => void submit("proposal")}
                >
                  <FileText /> Сформировать КП
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || enabled.length === 0}
                  onClick={() => void submit("draft")}
                >
                  <Save /> {orderId ? "Обновить заказ" : "Сохранить в заказ"}
                </Button>
              </div>
            )}
            {orderId && (
              <p className="text-xs text-muted-foreground">
                Расчёт привязан к заказу ·{" "}
                <a className="text-primary hover:underline" href={`/orders/${orderId}`}>
                  открыть
                </a>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
