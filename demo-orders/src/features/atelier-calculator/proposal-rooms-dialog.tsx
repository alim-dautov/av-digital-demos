"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKzt } from "@/lib/utils";
import { curtainStylesByIds } from "@/lib/domain/curtain-styles";
import {
  buildAtelierProposalDocument,
  recalculateAtelierQuote,
  roomBreakdown,
  selectQuoteRooms,
} from "@/lib/domain/atelier-calc";
import type { AtelierQuoteSnapshot, AtelierStoredQuote } from "@/types";

export function ProposalRoomsDialog({
  open,
  onOpenChange,
  quote,
  pending,
  onConfirm,
  title = "Комнаты в КП",
  description = "В предложение и его сумму попадут только отмеченные комнаты.",
  confirmLabel = "Сформировать КП",
  totalLabel = "Итого КП",
  initialSelected,
  sentIds,
  audience = "workshop",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: AtelierQuoteSnapshot | AtelierStoredQuote;
  pending: boolean;
  onConfirm: (roomIds: string[]) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  totalLabel?: string;
  /** Rooms checked when the dialog opens. Empty means all rooms. */
  initialSelected?: string[] | null;
  /** Rooms already handed to the workshop */
  sentIds?: string[] | null;
  /** Client КП preview: names, pictures and prices, without sizes. */
  audience?: "client" | "workshop";
}) {
  const view = recalculateAtelierQuote(quote);
  const allIds = view.rooms.map((r) => r.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const known = new Set(allIds);
      const start = initialSelected?.filter((id) => known.has(id)) ?? [];
      setSelected(new Set(start.length ? start : allIds));
    }
  }

  const ids = allIds.filter((id) => selected.has(id));
  const preview = selectQuoteRooms(view, ids);
  const clientDoc = audience === "client" ? buildAtelierProposalDocument(view, "client") : null;
  const sent = new Set(sentIds ?? []);
  const allChecked = ids.length === allIds.length;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 border-b border-border pb-2 text-sm font-medium">
          <Checkbox
            checked={allChecked}
            onCheckedChange={(c) => setSelected(new Set(c === true ? allIds : []))}
          />
          Выбрать все
        </label>

        <ul className="space-y-1">
          {view.rooms.map((r, index) => {
            const b = roomBreakdown(r);
            const clientRoom = clientDoc?.rooms[index];
            const styles = audience === "client" ? curtainStylesByIds(r.curtainStyleIds) : [];
            return (
              <li key={r.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(r.id)}
                    onCheckedChange={(c) => toggle(r.id, c === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">
                        {r.name.trim() || "Без названия"}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatKzt(r.subtotal)}</span>
                    </span>
                    {audience === "client" ? (
                      <>
                        {styles.length > 0 ? (
                          <span className="mt-2 flex gap-2 overflow-x-auto">
                            {styles.map((style) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={style.id}
                                src={style.src}
                                alt={style.label}
                                className="h-16 w-24 shrink-0 rounded-md border border-border bg-white object-contain"
                              />
                            ))}
                          </span>
                        ) : null}
                        <span className="mt-2 block space-y-1">
                          {clientRoom?.sections.flatMap((section) =>
                            section.rows.map((row, rowIndex) => (
                              <span
                                key={`${section.title}-${rowIndex}`}
                                className="flex justify-between gap-3 text-xs text-muted-foreground"
                              >
                                <span className="min-w-0 truncate">
                                  {row.name}
                                  {row.specs ? ` · ${row.specs}` : ""}
                                </span>
                                <span className="shrink-0 tabular-nums">{formatKzt(row.price)}</span>
                              </span>
                            )),
                          )}
                        </span>
                      </>
                    ) : (
                      <span className="block text-xs text-muted-foreground">
                        {sent.has(r.id) ? "Уже в цехе · " : ""}
                        Тюль {r.tulle.length} · портьера {r.portiere.length} · материалы{" "}
                        {formatKzt(b.materials)} · пошив {formatKzt(b.sewing)} · доп.{" "}
                        {formatKzt(b.extras)}
                      </span>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="overflow-hidden rounded-xl border border-border text-sm">
          <div className="space-y-1 bg-muted/40 px-4 py-3">
            <p className="text-muted-foreground">
              Выбрано комнат: {ids.length} из {allIds.length}
            </p>
            {preview.discountPercent > 0 ? (
              <>
                <p className="flex justify-between gap-3 text-muted-foreground">
                  <span>Стоимость</span>
                  <span className="tabular-nums">{formatKzt(preview.subtotal)}</span>
                </p>
                <p className="flex justify-between gap-3 text-muted-foreground">
                  <span>Скидка {preview.discountPercent}%</span>
                  <span className="tabular-nums">−{formatKzt(preview.discountAmount)}</span>
                </p>
              </>
            ) : null}
          </div>
          <div className="flex items-end justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <span className="text-xs font-medium uppercase tracking-[0.14em]">
              {audience === "client" ? "Итого к оплате" : totalLabel}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{formatKzt(preview.total)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={pending || ids.length === 0} onClick={() => onConfirm(ids)}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
