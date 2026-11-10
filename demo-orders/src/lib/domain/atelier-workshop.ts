import {
  ACCESSORY_COLOR_LABELS,
  COVER_CORNER_LABELS,
  COVER_STITCH_LABELS,
  COVER_TYPE_LABELS,
  FABRIC_KIND_LABELS,
  ROLLER_MECH_LABELS,
  ROLLER_MOUNT_LABELS,
  ROLLER_PANEL_LABELS,
  effectiveCoeff,
  recalculateAtelierQuote,
} from "@/lib/domain/atelier-calc";
import { formatMeters, formatNumberRu, formatSizeM } from "@/lib/utils";
import type {
  AtelierFabricLine,
  AtelierQuoteSnapshot,
  AtelierStoredQuote,
} from "@/types";
import { ATELIER_BLIND_LABELS, ATELIER_FORGED_COLOR_LABELS } from "@/types";

export type WorkshopLine = {
  title: string;
  details: string[];
  note?: string;
};

export type WorkshopRoom = {
  name: string;
  /** Total running meters of curtain fabric in the room */
  fabricMeters: number;
  lines: WorkshopLine[];
  curtainStyleIds: string[];
  pillows: { width: number; length: number }[];
  covers: { width: number; length: number; overhang: number }[];
};

export type WorkshopDocument = {
  orderComment: string;
  /** Header for seamstresses; empty strings are hidden */
  clientName: string;
  clientPhone: string;
  address: string;
  deadline: string;
  measurementDate: string;
  rooms: WorkshopRoom[];
  /** Total running meters per fabric across the order */
  fabricTotals: { kind: string; fabricName: string; meters: number }[];
};

function fabricLines(kindLabel: string, lines: AtelierFabricLine[]): WorkshopLine[] {
  return lines.map((line, index) => {
    const coeff = effectiveCoeff(line);
    const needed = line.metersNeeded || line.meterage;
    const details = [
      `Ткань: ${line.fabricName || "не указана"}`,
      line.width || line.height
        ? `Ширина ${formatMeters(line.width)} × высота ${formatMeters(line.height)}`
        : null,
      line.heightFrom?.trim() ? `Высота от: ${line.heightFrom.trim()}` : null,
      line.cut?.trim()
        ? `Разрез: ${line.cut.trim()}${line.cutNote?.trim() ? ` (${line.cutNote.trim()})` : ""}`
        : line.cutNote?.trim()
          ? `Разрез: ${line.cutNote.trim()}`
          : null,
      line.meterage ? `Метраж (замер) ${formatMeters(line.meterage, "п.м.")}` : null,
      coeff !== 1 ? `Коэффициент сборки ×${formatNumberRu(coeff)}` : "Без сборки (×1)",
      `Расход ткани ${formatMeters(needed, "п.м.")}`,
      line.sewing.pricing === "per_meter"
        ? line.sewing.meters
          ? `Пошив по метражу: ${formatMeters(line.sewing.meters, "п.м.")}`
          : null
        : line.sewing.price
          ? "Пошив: фиксированный"
          : null,
      line.tape.enabled ? `Монтажная лента ${formatMeters(line.tape.meters, "п.м.")}` : null,
      line.grommets && line.grommets.quantity > 0
        ? `Люверсы ${formatNumberRu(line.grommets.quantity)} шт`
        : null,
      line.loops && line.loops.quantity > 0 ? `Петли ${formatNumberRu(line.loops.quantity)} шт` : null,
      ...line.extras
        .filter((extra) => extra.name || extra.quantity)
        .map((extra) => `${extra.name || "Фурнитура"}: ${formatNumberRu(extra.quantity)} ${extra.unit}`),
      line.install?.price ? "Нужна установка" : null,
    ].filter((item): item is string => Boolean(item));
    return {
      title: `${kindLabel} №${index + 1}`,
      details,
      note: line.note?.trim() || undefined,
    };
  });
}

/** Заказ в цех: размеры, ткани, метраж, фурнитура и комментарии, без цен. */
export function buildWorkshopDocument(
  input: AtelierStoredQuote | AtelierQuoteSnapshot,
): WorkshopDocument {
  const quote = recalculateAtelierQuote(input);
  const totals = new Map<string, { kind: string; fabricName: string; meters: number }>();
  for (const room of quote.rooms) {
    for (const [kind, lines] of [
      [FABRIC_KIND_LABELS.tulle, room.tulle],
      [FABRIC_KIND_LABELS.portiere, room.portiere],
    ] as const) {
      for (const l of lines) {
        const meters = l.metersNeeded || l.meterage;
        if (!meters) continue;
        const name = l.fabricName.trim() || "не указана";
        const key = `${kind}|${name}`;
        const prev = totals.get(key) ?? { kind, fabricName: name, meters: 0 };
        prev.meters = Math.round((prev.meters + meters) * 100) / 100;
        totals.set(key, prev);
      }
    }
  }
  return {
    orderComment: quote.orderComment?.trim() ?? "",
    clientName: quote.clientName?.trim() ?? "",
    clientPhone: quote.clientPhone?.trim() ?? "",
    address: quote.address?.trim() ?? "",
    deadline: quote.deadline ?? "",
    measurementDate: quote.measurementDate ?? "",
    fabricTotals: [...totals.values()],
    rooms: quote.rooms.map((room) => {
      const lines: WorkshopLine[] = [
        ...room.cornices.map((line, index) => ({
          title: `Карниз №${index + 1}`,
          details: [
            line.label,
            `Длина ${formatMeters(line.meters)}`,
            line.forgedColor
              ? `Цвет ${ATELIER_FORGED_COLOR_LABELS[line.forgedColor].toLowerCase()}`
              : null,
            line.install?.price ? "Нужна установка" : null,
          ].filter((item): item is string => Boolean(item)),
        })),
        ...fabricLines(FABRIC_KIND_LABELS.tulle, room.tulle),
        ...fabricLines(FABRIC_KIND_LABELS.portiere, room.portiere),
        ...room.covers.map((line, index) => ({
          title: `Покрывало №${index + 1}`,
          details: [
            `${COVER_TYPE_LABELS[line.coverType]}, стежка «${COVER_STITCH_LABELS[line.stitch]}», угол ${COVER_CORNER_LABELS[line.corner].toLowerCase()}`,
            `Размер ${formatSizeM(line.width, line.length)}`,
            line.overhang ? `Свес ${formatMeters(line.overhang)}` : null,
            line.materialKind
              ? `Материал: ${line.materialKind === "sintepon" ? "синтепон" : "ткань"}${line.materialName ? ` ${line.materialName}` : ""}, ${formatMeters(line.materialMeterage ?? 0, "п.м.")}`
              : null,
            line.sewing?.meters
              ? `Пошив ${formatMeters(line.sewing.meters, "п.м.")}`
              : line.sewing
                ? "Есть пошив"
                : null,
          ].filter((item): item is string => Boolean(item)),
        })),
        ...room.pillows.map((line, index) => ({
          title: `Подушка №${index + 1}`,
          details: [
            `${line.pillowType === "cover" ? "Наволочка" : "Полный комплект"}, ${formatNumberRu(line.quantity)} шт`,
            formatSizeM(line.width, line.height),
            line.materialKind
              ? `Материал: ${line.materialKind === "sintepon" ? "синтепон" : "ткань"}${line.materialName ? ` ${line.materialName}` : ""}${line.materialMeterage ? `, ${formatMeters(line.materialMeterage, "п.м.")}` : ""}`
              : null,
            line.fillingName?.trim()
              ? `Наполнитель: ${line.fillingName.trim()}, ${formatNumberRu(line.fillingQty ?? 0)}`
              : null,
          ].filter((item): item is string => Boolean(item)),
          note: line.note?.trim() || undefined,
        })),
        ...room.accessories.map((line) => ({
          title: line.label,
          details: [
            `${ACCESSORY_COLOR_LABELS[line.color]}, ${formatNumberRu(line.quantity)} шт`,
            line.kind === "side_hooks" ? "Нужна установка крючков" : null,
          ].filter((item): item is string => Boolean(item)),
        })),
        ...room.rollers.map((line, index) => ({
          title: `Ролл-штора №${index + 1}`,
          details: [
            ROLLER_PANEL_LABELS[line.panel],
            `Ш × В: ${formatSizeM(line.width, line.height)}, ${formatMeters(line.sqm, "м²")}`,
            `Крепление: ${ROLLER_MOUNT_LABELS[line.mount].toLowerCase()}, механизм ${ROLLER_MECH_LABELS[line.mechanismColor].toLowerCase()}`,
            line.install?.price ? "Нужна установка" : null,
          ].filter((item): item is string => Boolean(item)),
        })),
        ...(room.blinds ?? []).map((line, index) => ({
          title: `Жалюзи №${index + 1} — ${ATELIER_BLIND_LABELS[line.kind]}`,
          details: [
            `Ш × В: ${formatSizeM(line.width, line.height)}`,
            `Площадь ${formatMeters(line.sqm, "м²")}`,
            line.install?.price ? "Нужна установка" : null,
          ].filter((item): item is string => Boolean(item)),
          note: line.note?.trim() || undefined,
        })),
      ];
      return {
        name: room.name.trim() || "Без названия",
        fabricMeters:
          Math.round(
            [...room.tulle, ...room.portiere].reduce(
              (sum, l) => sum + (l.metersNeeded || l.meterage),
              0,
            ) * 100,
          ) / 100,
        lines,
        curtainStyleIds: room.curtainStyleIds ?? [],
        pillows: room.pillows.map((line) => ({ width: line.width, length: line.height })),
        covers: room.covers.map((line) => ({
          width: line.width,
          length: line.length,
          overhang: line.overhang,
        })),
      };
    }),
  };
}
