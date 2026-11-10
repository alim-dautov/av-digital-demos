"use client";

import { useId, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatKzt, formatMeters, formatNumberRu } from "@/lib/utils";
import {
  FABRIC_KIND_LABELS,
  effectiveCoeff,
  coefficientForFabricMeters,
  emptyExtraLine,
  emptyFabricLine,
} from "@/lib/domain/atelier-calc";
import type {
  AtelierAssemblyCoeff,
  AtelierExtraLine,
  AtelierFabric,
  AtelierFabricKind,
  AtelierFabricLine,
  AtelierLabels,
  AtelierPieceCharge,
  AtelierServicePrices,
} from "@/types";
import { emptyPiece } from "@/lib/domain/atelier-calc";
import { InstallFields, NumberField } from "./fields";

const EXTRA_UNITS = ["шт", "п.м.", "м²", "компл.", "усл."];

type Shared = {
  fabrics: AtelierFabric[];
  coeffs: AtelierAssemblyCoeff[];
  servicePrices: AtelierServicePrices;
  labels: AtelierLabels;
  installSale: number;
  installCost: number;
  canWrite: boolean;
  corniceWidth?: number;
  onCreateFabric?: (input: {
    name: string;
    salePrice: number;
    type: AtelierFabricKind;
  }) => Promise<AtelierFabric | null>;
};

export function FabricBlock({
  kind,
  lines,
  onChange,
  ...shared
}: Shared & {
  kind: AtelierFabricKind;
  lines: AtelierFabricLine[];
  onChange: (lines: AtelierFabricLine[]) => void;
}) {
  const kindLabel = FABRIC_KIND_LABELS[kind];
  const defaultCoeff = shared.coeffs[1]?.value ?? shared.coeffs[0]?.value ?? 2;
  return (
    <div className="space-y-4">
      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {kindLabel} в этой комнате не считается. Добавьте позицию, если нужна.
        </p>
      )}
      {lines.map((line, idx) => (
        <FabricLineCard
          key={line.id}
          title={`${kindLabel} №${idx + 1}`}
          kind={kind}
          line={line}
          onChange={(next) => onChange(lines.map((l) => (l.id === line.id ? next : l)))}
          onRemove={() => onChange(lines.filter((l) => l.id !== line.id))}
          {...shared}
        />
      ))}
      {shared.canWrite && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            onChange([
              ...lines,
              {
                ...emptyFabricLine(shared.servicePrices, defaultCoeff),
                meterageMode: "width_coeff",
                width: shared.corniceWidth ?? 0,
                widthManual: false,
                tape: {
                  ...emptyFabricLine(shared.servicePrices, defaultCoeff).tape,
                  enabled: true,
                },
              },
            ])
          }
        >
          <Plus className="mr-1 size-4" /> {lines.length ? "Добавить ещё" : `Добавить: ${kindLabel.toLowerCase()}`}
        </Button>
      )}
    </div>
  );
}

function FabricLineCard({
  title,
  kind,
  line,
  onChange,
  onRemove,
  fabrics,
  coeffs,
  servicePrices,
  labels,
  installSale,
  installCost,
  canWrite,
  corniceWidth = 0,
  onCreateFabric,
}: Shared & {
  title: string;
  kind: AtelierFabricKind;
  line: AtelierFabricLine;
  onChange: (line: AtelierFabricLine) => void;
  onRemove: () => void;
}) {
  const coeffSwitchId = useId();
  const kpCoeffId = useId();
  const heightCommentId = useId();
  const [otherName, setOtherName] = useState("");
  const [otherPrice, setOtherPrice] = useState(0);
  const [creating, setCreating] = useState(false);
  const disabled = !canWrite;
  const set = (p: Partial<AtelierFabricLine>) => onChange({ ...line, ...p });
  const widthMode = line.meterageMode === "width_coeff";
  const sameKind = fabrics.filter((f) => f.type === kind);
  const options = sameKind.length ? sameKind : fabrics;
  const coeff = effectiveCoeff(line);
  const extrasTotal = line.extras.reduce((s, e) => s + e.lineTotal, 0);

  return (
    <div className="calculator-inset space-y-4 rounded-lg border border-border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {canWrite && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Удалить ${title}`}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label>Ткань</Label>
          <Select
            value={line.fabricId ?? ""}
            disabled={disabled}
            onValueChange={(v) => {
              if (v === "__other__") {
                set({ fabricId: null, fabricName: "" });
                return;
              }
              const f = fabrics.find((x) => x.id === v);
              if (!f) return;
              set({
                fabricId: f.id,
                fabricName: f.name,
                salePerMeter: f.salePrice,
                costPerMeter: f.costPrice,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} ({f.article}) · {formatKzt(f.salePrice)}/п.м.
                </SelectItem>
              ))}
              <SelectItem value="__other__">Другое</SelectItem>
            </SelectContent>
          </Select>
          {!line.fabricId && canWrite && onCreateFabric ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <div>
                <Label>Новая ткань</Label>
                <Input value={otherName} disabled={creating} onChange={(e) => setOtherName(e.target.value)} />
              </div>
              <NumberField label="Цена" unit="₸/п.м." value={otherPrice} disabled={creating} onChange={setOtherPrice} />
              <Button
                type="button"
                disabled={creating || !otherName.trim()}
                onClick={() => {
                  setCreating(true);
                  void onCreateFabric({ name: otherName.trim(), salePrice: otherPrice, type: kind })
                    .then((created) => {
                      if (!created) return;
                      set({
                        fabricId: created.id,
                        fabricName: created.name,
                        salePerMeter: created.salePrice,
                        costPerMeter: created.costPrice,
                      });
                      setOtherName("");
                      setOtherPrice(0);
                    })
                    .finally(() => setCreating(false));
                }}
              >
                В справочник
              </Button>
            </div>
          ) : null}
        </div>
        <NumberField
          label="Метраж"
          unit="п.м."
          value={line.metersNeeded}
          disabled={disabled || (widthMode && line.width <= 0)}
          hint={widthMode && line.width <= 0 ? "Сначала укажите ширину" : "При изменении пересчитывается коэффициент"}
          onChange={(meters) => {
            if (!widthMode && line.meterage <= 0) {
              set({ meterage: meters / coeff });
              return;
            }
            const assemblyCoeff = coefficientForFabricMeters(line, meters);
            if (assemblyCoeff !== null) set({ assemblyCoeff, coeffEnabled: true });
          }}
        />
        <NumberField
          label="Цена ткани"
          unit="₸/п.м."
          value={line.salePerMeter}
          disabled={disabled}
          onChange={(salePerMeter) => set({ salePerMeter })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,9rem)_minmax(0,9rem)_1fr]">
        <NumberField
          label="Ширина"
          unit="м"
          value={line.width}
          disabled={disabled}
          hint={corniceWidth ? `По карнизу ${formatMeters(corniceWidth)}` : undefined}
          onChange={(width) => set({ width, widthManual: true, meterageMode: line.meterageMode ?? "width_coeff" })}
        />
        <NumberField
          label="Высота"
          unit="м"
          value={line.height}
          disabled={disabled}
          onChange={(height) => set({ height })}
        />
        <div>
          <Label htmlFor={heightCommentId}>Комментарий</Label>
          <Input
            id={heightCommentId}
            value={line.heightFrom ?? ""}
            disabled={disabled}
            placeholder="К высоте"
            onChange={(e) => set({ heightFrom: e.target.value })}
          />
        </div>
      </div>

      <div className="calculator-inset grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="flex items-center gap-2 sm:pb-2">
          <Switch
            id={coeffSwitchId}
            checked={line.coeffEnabled}
            disabled={disabled}
            onCheckedChange={(coeffEnabled) => set({ coeffEnabled })}
          />
          <Label htmlFor={coeffSwitchId} className="font-normal">
            Коэффициент сборки
          </Label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            label="Коэффициент"
            unit="×"
            className="w-32"
            value={line.assemblyCoeff}
            disabled={disabled || !line.coeffEnabled}
            onChange={(assemblyCoeff) => set({ assemblyCoeff })}
          />
          {line.coeffEnabled &&
            coeffs.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant={line.assemblyCoeff === c.value ? "secondary" : "ghost"}
                disabled={disabled}
                onClick={() => set({ assemblyCoeff: c.value })}
              >
                ×{formatNumberRu(c.value)}
              </Button>
            ))}
        </div>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Расход ткани:{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatMeters(line.metersNeeded, "п.м.")}
          </span>
          {widthMode && line.width > 0
            ? ` = ${formatNumberRu(line.width)} м × ${formatNumberRu(coeff)}`
            : !widthMode && line.meterage > 0
              ? ` = ${formatNumberRu(line.meterage)} п.м. × ${formatNumberRu(coeff)}`
              : ""}
          {!line.coeffEnabled ? " (коэффициент отключён)" : ""}
          {" · "}ткань {formatKzt(line.lineTotal)}
        </p>
        {line.coeffEnabled && (
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id={kpCoeffId}
              checked={line.showCoeffInKp}
              disabled={disabled}
              onCheckedChange={(c) => set({ showCoeffInKp: Boolean(c) })}
            />
            <Label htmlFor={kpCoeffId} className="font-normal">
              Показывать коэффициент в КП
            </Label>
          </div>
        )}
      </div>

      <SewingFields line={line} labels={labels} servicePrices={servicePrices} disabled={disabled} onChange={set} />

      <TapeFields line={line} labels={labels} servicePrices={servicePrices} disabled={disabled} onChange={set} />
      <PieceRow
        title="Люверсы"
        value={line.grommets}
        disabled={disabled}
        onChange={(grommets) => set({ grommets })}
      />
      <PieceRow
        title="Петли"
        value={line.loops}
        disabled={disabled}
        onChange={(loops) => set({ loops })}
      />

      <ExtrasFields extras={line.extras} disabled={disabled} onChange={(extras) => set({ extras })} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Разрез</Label>
          <Input value={line.cut ?? ""} disabled={disabled} onChange={(e) => set({ cut: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Комментарий к разрезу</Label>
          <Input value={line.cutNote ?? ""} disabled={disabled} onChange={(e) => set({ cutNote: e.target.value })} />
        </div>
      </div>

      <div>
        <Label>Комментарий / заметки</Label>
        <Textarea
          value={line.note ?? ""}
          disabled={disabled}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>

      <InstallFields
        label={labels["install.curtains"]}
        value={line.install}
        defaultSale={installSale}
        defaultCost={installCost}
        disabled={disabled}
        onChange={(install) => set({ install })}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
        <p className="text-muted-foreground">
          Ткань {formatKzt(line.lineTotal)} · {labels["sewing.title"]} {formatKzt(line.sewing.price)}
          {line.tape.enabled ? ` · Лента ${formatKzt(line.tape.price)}` : ""}
          {extrasTotal ? ` · Доп. материалы ${formatKzt(extrasTotal)}` : ""}
          {line.install.price ? ` · ${labels["install.curtains"]} ${formatKzt(line.install.price)}` : ""}
        </p>
        <p className="font-semibold tabular-nums">{formatKzt(line.total)}</p>
      </div>
    </div>
  );
}

type FieldsProps = {
  line: AtelierFabricLine;
  labels: AtelierLabels;
  servicePrices: AtelierServicePrices;
  disabled: boolean;
  onChange: (p: Partial<AtelierFabricLine>) => void;
};

function SewingFields({ line, labels, servicePrices, disabled, onChange }: FieldsProps) {
  const s = line.sewing;
  const set = (p: Partial<AtelierFabricLine["sewing"]>) => onChange({ sewing: { ...s, ...p } });

  if (s.pricing === "fixed") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={labels["sewing.title"]}
          unit="₸"
          value={s.price}
          disabled={disabled}
          onChange={(price) => set({ price })}
          hint={
            !disabled && (
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() =>
                  set({
                    pricing: "per_meter",
                    ratePerMeter: servicePrices.sewingSalePerMeter,
                    costPerMeter: servicePrices.sewingCostPerMeter,
                    metersManual: false,
                  })
                }
              >
                Считать за п.м.
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <NumberField
        label={labels["sewing.title"]}
        unit="₸/п.м."
        value={s.ratePerMeter}
        disabled={disabled}
        onChange={(ratePerMeter) => set({ ratePerMeter })}
      />
      <NumberField
        label={`${labels["sewing.title"]}: ${labels["sewing.linearMeters"].toLowerCase()}`}
        unit="п.м."
        value={s.meters}
        disabled={disabled}
        onChange={(meters) => set({ meters, metersManual: true })}
        hint={
          s.metersManual ? (
            !disabled && (
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => set({ metersManual: false })}
              >
                По расходу ткани ({formatMeters(line.metersNeeded, "п.м.")})
              </button>
            )
          ) : (
            "По расходу ткани"
          )
        }
      />
      <div className="flex items-end pb-2 text-sm">
        <span className="text-muted-foreground">Итого пошив:&nbsp;</span>
        <span className="font-medium tabular-nums">{formatKzt(s.price)}</span>
      </div>
    </div>
  );
}

function TapeFields({ line, labels, servicePrices, disabled, onChange }: FieldsProps) {
  const t = line.tape;
  const set = (p: Partial<AtelierFabricLine["tape"]>) =>
    onChange({ tape: { ...t, ...p, enabled: true } });

  return (
    <div className="calculator-inset overflow-hidden rounded-lg border border-border">
      <div className="px-3 py-2 text-sm font-medium">{labels["sewing.tape"]}</div>
      <div className="grid gap-4 border-t border-border px-3 py-3 sm:grid-cols-3">
          <NumberField
            label="Метраж ленты"
            unit="п.м."
            value={t.meters}
            disabled={disabled}
            onChange={(meters) => set({ meters, metersManual: true })}
            hint={
              t.metersManual ? (
                !disabled && (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => set({ metersManual: false })}
                  >
                    По расходу ткани ({formatMeters(line.metersNeeded, "п.м.")})
                  </button>
                )
              ) : (
                "По расходу ткани"
              )
            }
          />
          <NumberField
            label="Цена ленты"
            unit="₸/п.м."
            value={t.ratePerMeter}
            disabled={disabled}
            onChange={(ratePerMeter) => set({ ratePerMeter, costPerMeter: t.costPerMeter || servicePrices.tapeCostPerMeter })}
          />
          <div className="flex items-end pb-2 text-sm">
            <span className="text-muted-foreground">Итого лента:&nbsp;</span>
            <span className="font-medium tabular-nums">{formatKzt(t.price)}</span>
          </div>
        </div>
    </div>
  );
}

function PieceRow({
  title,
  value,
  disabled,
  onChange,
}: {
  title: string;
  value?: AtelierPieceCharge;
  disabled?: boolean;
  onChange: (value: AtelierPieceCharge) => void;
}) {
  const piece = { ...emptyPiece(), ...value };
  return (
    <div className="calculator-inset grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
      <p className="text-sm font-medium sm:col-span-3">{title}</p>
      <NumberField
        label="Количество"
        unit="шт"
        value={piece.quantity}
        disabled={disabled}
        onChange={(quantity) => onChange({ ...piece, quantity })}
      />
      <NumberField
        label="Цена"
        unit="₸/шт"
        value={piece.salePerUnit}
        disabled={disabled}
        onChange={(salePerUnit) => onChange({ ...piece, salePerUnit })}
      />
      <div className="flex items-end pb-2 text-sm">
        <span className="font-medium tabular-nums">{formatKzt(piece.price)}</span>
      </div>
    </div>
  );
}

function ExtrasFields({
  extras,
  disabled,
  onChange,
}: {
  extras: AtelierExtraLine[];
  disabled: boolean;
  onChange: (extras: AtelierExtraLine[]) => void;
}) {
  const update = (id: string, p: Partial<AtelierExtraLine>) =>
    onChange(extras.map((e) => (e.id === id ? { ...e, ...p } : e)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Дополнительные материалы</p>
        {!disabled && (
          <Button type="button" variant="outline" className="w-full" onClick={() => onChange([...extras, emptyExtraLine()])}>
            <Plus className="mr-1 size-4" /> Материал
          </Button>
        )}
      </div>
      {extras.map((e) => (
        <div
          key={e.id}
          className="calculator-inset grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem_minmax(0,1fr)_auto] sm:items-end"
        >
          <div>
            <Label>Название</Label>
            <Input
              value={e.name}
              disabled={disabled}
              onChange={(ev) => update(e.id, { name: ev.target.value })}
            />
          </div>
          <NumberField
            label="Количество"
            unit={e.unit}
            value={e.quantity}
            disabled={disabled}
            onChange={(quantity) => update(e.id, { quantity })}
          />
          <div>
            <Label>Ед. изм.</Label>
            <Select value={e.unit} disabled={disabled} onValueChange={(unit) => update(e.id, { unit })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(EXTRA_UNITS.includes(e.unit) ? EXTRA_UNITS : [...EXTRA_UNITS, e.unit]).map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumberField
            label="Цена"
            unit={`₸/${e.unit}`}
            value={e.salePerUnit}
            disabled={disabled}
            onChange={(salePerUnit) => update(e.id, { salePerUnit })}
          />
          <div className="flex items-center justify-between gap-2 sm:justify-end sm:pb-1">
            <span className="text-sm font-medium tabular-nums">{formatKzt(e.lineTotal)}</span>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Удалить материал"
                onClick={() => onChange(extras.filter((x) => x.id !== e.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
