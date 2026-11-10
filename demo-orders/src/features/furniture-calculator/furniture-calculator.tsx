"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import type {
  FurnitureCountKey,
  FurnitureCountertop,
  FurnitureFacadeMaterial,
  FurnitureModule,
  FurnitureModuleKind,
  FurniturePriceItem,
  FurnitureQuoteSnapshot,
} from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, formatKzt, generateId } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import {
  MODULE_KINDS,
  MODULE_TEMPLATES,
  createModule,
  moduleLabel,
} from "@/lib/domain/furniture/modules";
import {
  COUNT_LABELS,
  FACADE_MATERIAL_LABELS,
  emptyFurnitureQuote,
  recalculateFurnitureQuote,
} from "@/lib/domain/furniture/quote";
import { ModuleCard } from "./module-card";
import { ModulePreview } from "./module-preview";
import { KitchenElevation } from "./kitchen-elevation";
import { CuttingMap, PartsTable } from "./cutting-map";
import { SummaryPanel } from "./summary-panel";
import { FinishPicker } from "./3d/finish-picker";
import { DEFAULT_CARCASS_FINISH, defaultFacadeFinish } from "./3d/finishes";
import { QuickCalculator } from "./quick-calculator";
import { CalculatorSectionLayout, CalculatorSortableSection } from "@/components/calculator/sortable-sections";

const Furniture3DEditor = dynamic(
  () => import("./3d/furniture-3d-editor").then((m) => m.Furniture3DEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[440px] items-center justify-center rounded-lg bg-canvas text-sm text-muted-foreground sm:h-[540px]">
        Загружаем 3D…
      </div>
    ),
  },
);

type ClientOpt = { id: string; fullName: string; phone: string; address?: string | null };

type Props = {
  clients: ClientOpt[];
  prices: FurniturePriceItem[];
  canWrite: boolean;
  companyName: string;
  initialOrderId?: string | null;
  initialQuote?: FurnitureQuoteSnapshot | null;
};

const COUNT_KEYS: FurnitureCountKey[] = [
  "hdfSheets",
  "countertopSheets",
  "edgeMeters",
  "hinges",
  "slides",
  "legs",
  "crabs",
];

const EXTRA_CATEGORIES = new Set(["lift", "accessory", "service", "mdf_sheet"]);
const AUTO_CODES = new Set(["crab", "leg", "sawing", "transport"]);

function stripResult(q: FurnitureQuoteSnapshot): FurnitureQuoteSnapshot {
  return { ...q, result: null };
}

/** Quotes saved before the quick calculator existed keep their detailed behavior. */
function restoreFurnitureQuote(prices: FurniturePriceItem[], quote: FurnitureQuoteSnapshot): FurnitureQuoteSnapshot {
  return emptyFurnitureQuote(prices, {
    ...quote,
    calculationMode: quote.calculationMode ?? "detailed",
  });
}

type FurnitureDraft = {
  input: FurnitureQuoteSnapshot;
  orderId: string | null;
  activeId: string | null;
};

function readFurnitureDraft(raw: string): FurnitureDraft | null {
  const parsed = JSON.parse(raw) as FurnitureDraft & FurnitureQuoteSnapshot;
  if (parsed?.input && Array.isArray(parsed.input.modules)) return parsed;
  if (Array.isArray(parsed?.modules)) {
    return { input: parsed, orderId: null, activeId: null };
  }
  return null;
}

/** Plain /calculator keeps the session. An explicit other order replaces it. */
function shouldRestoreFurnitureDraft(
  session: FurnitureDraft | null,
  initialOrderId: string | null | undefined,
): session is FurnitureDraft {
  if (!session) return false;
  if (initialOrderId) return session.orderId === initialOrderId;
  return true;
}

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <CalculatorSortableSection id={id}>
    <section id={id} className="calculator-block scroll-mt-28 p-4 sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
    </CalculatorSortableSection>
  );
}

function OverrideField({
  label,
  auto,
  value,
  disabled,
  onChange,
}: {
  label: string;
  auto: number;
  value: number | undefined;
  disabled: boolean;
  onChange: (v: number | undefined) => void;
}) {
  const overridden = typeof value === "number";
  return (
    <div>
      <Label className="mb-1 flex items-center justify-between text-xs font-normal text-muted-foreground">
        {label}
        {overridden && !disabled && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <RotateCcw className="size-3" /> авто {auto}
          </button>
        )}
      </Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        disabled={disabled}
        placeholder={`${auto} (авто)`}
        value={overridden ? value : ""}
        className={cn("tabular-nums", overridden && "border-primary/50")}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(undefined);
          const n = Number(raw);
          onChange(Number.isFinite(n) && n >= 0 ? n : undefined);
        }}
      />
    </div>
  );
}

export function FurnitureCalculator({
  clients,
  prices,
  canWrite,
  companyName,
  initialOrderId,
  initialQuote,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [orderId, setOrderId] = useState<string | null>(initialOrderId ?? null);
  const [input, setInput] = useState<FurnitureQuoteSnapshot>(() =>
    initialQuote ? stripResult(restoreFurnitureQuote(prices, initialQuote)) : emptyFurnitureQuote(prices),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [pending, setPending] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const draftKey = `furniture-draft:${companyName}`;
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      const session = raw ? readFurnitureDraft(raw) : null;
      if (shouldRestoreFurnitureDraft(session, initialOrderId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore draft after hydration
        setInput(stripResult(restoreFurnitureQuote(prices, session.input)));
        setOrderId(session.orderId);
        setActiveId(session.activeId);
      }
    } catch {
      /* ignore broken draft */
    }
    setDraftRestored(true);
  }, [draftKey, initialOrderId, prices]);

  useEffect(() => {
    if (!draftRestored) return;
    try {
      const session: FurnitureDraft = { input, orderId, activeId };
      localStorage.setItem(draftKey, JSON.stringify(session));
    } catch {
      /* ignore quota */
    }
  }, [input, orderId, activeId, draftKey, draftRestored]);

  const quote = useMemo(() => recalculateFurnitureQuote(input, prices), [input, prices]);
  const r = quote.result;

  const patch = useCallback((p: Partial<FurnitureQuoteSnapshot>) => {
    setInput((q) => ({ ...q, ...p }));
  }, []);

  const setModules = (fn: (mods: FurnitureModule[]) => FurnitureModule[]) =>
    setInput((q) => ({ ...q, modules: fn(q.modules) }));

  function addModule(kind: FurnitureModuleKind) {
    const m = createModule(kind, generateId("mod"));
    setModules((mods) => [...mods, m]);
    setActiveId(m.id);
  }

  function selectFromElevation(id: string) {
    setActiveId(id);
    document.getElementById(`module-${id}`)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }

  const ldspItems = prices.filter((p) => p.category === "ldsp" && p.active);
  const hingeItems = prices.filter((p) => p.category === "hinge" && p.active);
  const slideItems = prices.filter((p) => p.category === "slide" && p.active);
  const extraItems = prices.filter(
    (p) => EXTRA_CATEGORIES.has(p.category) && p.active && !AUTO_CODES.has(p.code),
  );
  const priceById = useMemo(() => new Map(prices.map((p) => [p.id, p])), [prices]);
  const hasDrawers = quote.modules.some((m) => m.kind === "base" && m.variant !== "doors");

  async function submit(action: "draft" | "proposal") {
    if (!canWrite) return;
    if (!input.clientName.trim() && !input.clientId) {
      toast.error("Укажите клиента");
      document.getElementById("client")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/furniture/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, quote: stripResult(input), action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      if (data.quote) setInput(stripResult(restoreFurnitureQuote(prices, data.quote)));
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
    setInput(emptyFurnitureQuote(prices));
    setActiveId(null);
    window.history.replaceState(null, "", "/calculator");
  }

  function pickClient(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    patch({
      clientId: c.id,
      clientName: c.fullName,
      clientPhone: c.phone,
      address: c.address ?? input.address,
    });
  }

  const setCount = (key: FurnitureCountKey, v: number | undefined) =>
    setInput((q) => {
      const counts = { ...q.overrides.counts };
      if (v === undefined) delete counts[key];
      else counts[key] = v;
      return { ...q, overrides: { ...q.overrides, counts } };
    });

  const setSheetOverride = (materialId: string, v: number | undefined) =>
    setInput((q) => {
      const sheets = { ...q.overrides.sheets };
      if (v === undefined) delete sheets[materialId];
      else sheets[materialId] = v;
      return { ...q, overrides: { ...q.overrides, sheets } };
    });

  if (input.calculationMode === "quick") {
    return (
      <QuickCalculator
        clients={clients}
        quote={quote}
        canWrite={canWrite}
        pending={pending}
        orderId={orderId}
        companyName={companyName}
        onPatch={patch}
        onModeChange={(calculationMode) => patch({ calculationMode })}
        onSubmit={(action) => void submit(action)}
        onNew={startNew}
      />
    );
  }

  const listMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: SPRING,
      };

  const summary = (
    <SummaryPanel
      quote={quote}
      canWrite={canWrite}
      pending={pending}
      orderId={orderId}
      onPatch={patch}
      onSubmit={(a) => void submit(a)}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{companyName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Калькулятор мебели</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Соберите модули, остальное посчитается само: детали, раскрой, фурнитура и цена
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

      <div className="inline-flex rounded-md bg-canvas p-1" role="radiogroup" aria-label="Режим расчёта">
        <button
          type="button"
          role="radio"
          aria-checked={false}
          onClick={() => patch({ calculationMode: "quick" })}
          className="min-h-10 rounded-sm px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Быстрый расчёт
        </button>
        <button
          type="button"
          role="radio"
          aria-checked
          className="min-h-10 rounded-sm bg-panel px-4 text-sm font-medium text-foreground dark:bg-foreground/[0.1]"
        >
          Детальный расчёт
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 overflow-x-clip">
        <CalculatorSectionLayout
          storageKey="calculator-section-order:furniture-detailed"
          ids={["client", "modules", "materials", "cutting", "counts", "extras"]}
          className="px-3 py-3"
        >
          <Section id="client" title="Клиент и проект">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <Label>Из базы</Label>
                <Select value={input.clientId ?? ""} onValueChange={pickClient} disabled={!canWrite}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выбрать клиента…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName} · {c.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fc-name">Имя</Label>
                <Input
                  id="fc-name"
                  value={input.clientName}
                  disabled={!canWrite}
                  onChange={(e) => patch({ clientName: e.target.value, clientId: null })}
                />
              </div>
              <div>
                <Label htmlFor="fc-phone">Телефон</Label>
                <Input
                  id="fc-phone"
                  type="tel"
                  value={input.clientPhone}
                  disabled={!canWrite}
                  onChange={(e) => patch({ clientPhone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="fc-project">Проект</Label>
                <Input
                  id="fc-project"
                  value={input.projectName}
                  placeholder="Кухня, шкаф…"
                  disabled={!canWrite}
                  onChange={(e) => patch({ projectName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="fc-address">Адрес</Label>
                <Input
                  id="fc-address"
                  value={input.address}
                  disabled={!canWrite}
                  onChange={(e) => patch({ address: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="fc-deadline">Дедлайн</Label>
                <Input
                  id="fc-deadline"
                  type="date"
                  value={input.deadline}
                  disabled={!canWrite}
                  onChange={(e) => patch({ deadline: e.target.value })}
                />
              </div>
            </div>
          </Section>

          <Section
            id="modules"
            title="Модули"
            description={
              r && r.kitchenLength > 0
                ? `Длина кухни ${r.kitchenLength} мм${r.wardrobeWidth ? ` · пеналы ${r.wardrobeWidth} мм` : ""}`
                : "Нажмите на модуль, чтобы добавить его с базовыми размерами"
            }
          >
            {canWrite && (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {MODULE_KINDS.map((kind) => {
                  const t = MODULE_TEMPLATES[kind];
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => addModule(kind)}
                      className="group flex items-center gap-3 rounded-lg border border-border bg-canvas p-3 text-left transition-[background-color,transform] duration-150 hover:bg-foreground/[0.06] active:scale-[0.98]"
                    >
                      <span className="flex h-14 w-10 shrink-0 items-end">
                        <ModulePreview module={createModule(kind, kind)} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-sm font-medium">
                          <Plus className="size-3.5 shrink-0 text-primary" />
                          {t.shortLabel}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {t.height}×{t.width}×{t.depth}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div
                  role="tablist"
                  aria-label="Вид"
                  className="inline-flex rounded-md bg-canvas p-0.5"
                >
                  {(["3d", "2d"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={viewMode === v}
                      onClick={() => setViewMode(v)}
                      className={cn(
                        "touch-manipulation min-h-12 rounded-md px-4 text-base font-medium transition-none",
                        viewMode === v
                          ? "bg-foreground/[0.08] text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {v === "3d" ? "3D" : "Развёртка"}
                    </button>
                  ))}
                </div>
              </div>
              {viewMode === "3d" ? (
                <Furniture3DEditor
                  modules={quote.modules}
                  activeId={activeId}
                  onSelect={setActiveId}
                  onModulesChange={(next) => setModules(() => next)}
                  room={input.room}
                  onRoomChange={(room) => patch({ room })}
                  carcassColor={input.carcassColor}
                  facadeColor={input.facadeColor}
                  facadeMaterial={input.facadeMaterial}
                  showCountertop={input.countertop !== "none"}
                  labelFor={moduleLabel}
                  canWrite={canWrite}
                />
              ) : (
                quote.modules.length > 0 && (
                  <div className="calculator-inset rounded-lg px-3 pt-3">
                    <KitchenElevation
                      modules={quote.modules}
                      activeId={activeId}
                      onSelect={selectFromElevation}
                      showCountertop={input.countertop !== "none"}
                    />
                  </div>
                )
              )}
            </div>

            <div className="mt-4 space-y-4">
              <AnimatePresence initial={false}>
                {quote.modules.map((m, i) => (
                  <motion.div key={m.id} layout={!reduceMotion} {...listMotion}>
                    <ModuleCard
                      module={m}
                      index={i}
                      parts={r?.parts.filter((p) => p.moduleId === m.id) ?? []}
                      pricing={r?.modulePrices?.[m.id]}
                      active={activeId === m.id}
                      canWrite={canWrite}
                      onFocus={() => setActiveId(m.id)}
                      onChange={(next) =>
                        setModules((mods) => mods.map((x) => (x.id === m.id ? next : x)))
                      }
                      onDuplicate={() => {
                        const copy = { ...m, id: generateId("mod") };
                        setModules((mods) => {
                          const idx = mods.findIndex((x) => x.id === m.id);
                          return [...mods.slice(0, idx + 1), copy, ...mods.slice(idx + 1)];
                        });
                        setActiveId(copy.id);
                      }}
                      onRemove={() => setModules((mods) => mods.filter((x) => x.id !== m.id))}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Section>

          <Section id="materials" title="Материалы и фурнитура">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Корпус (ЛДСП)</Label>
                <Select
                  value={input.carcassMaterialId}
                  disabled={!canWrite}
                  onValueChange={(v) => patch({ carcassMaterialId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ldspItems.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.sheetWidth}×{p.sheetHeight} · {formatKzt(p.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Фасады</Label>
                <Select
                  value={input.facadeMaterial}
                  disabled={!canWrite}
                  onValueChange={(v) => patch({ facadeMaterial: v as FurnitureFacadeMaterial })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FACADE_MATERIAL_LABELS) as FurnitureFacadeMaterial[]).map((k) => {
                      const item = prices.find((p) => p.code === k);
                      return (
                        <SelectItem key={k} value={k}>
                          {FACADE_MATERIAL_LABELS[k]}
                          {item ? ` · ${formatKzt(item.price)}/м²` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  Площадь фасадов: {r?.facadeAreaSqm ?? 0} м²
                </p>
              </div>

              {input.facadeMaterial === "ldsp" && (
                <div>
                  <Label>ЛДСП фасадов</Label>
                  <Select
                    value={input.facadeSheetMaterialId ?? input.carcassMaterialId}
                    disabled={!canWrite}
                    onValueChange={(v) =>
                      patch({ facadeSheetMaterialId: v === input.carcassMaterialId ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ldspItems.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.id === input.carcassMaterialId ? `Как корпус · ${p.name}` : p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {input.facadeMaterial === "egger" && (
                <div>
                  <Label htmlFor="fc-egger">Себестоимость фасадов EGGER, ₸</Label>
                  <Input
                    id="fc-egger"
                    type="number"
                    min={0}
                    disabled={!canWrite}
                    value={input.eggerFacadeCost || ""}
                    onChange={(e) => patch({ eggerFacadeCost: Number(e.target.value) || 0 })}
                  />
                </div>
              )}

              <div>
                <Label>Столешница</Label>
                <div role="radiogroup" aria-label="Столешница" className="flex h-10 rounded-md bg-canvas p-1">
                  {(
                    [
                      ["none", "Нет"],
                      ["ldsp", "ЛДСП"],
                      ["manual", "Своя цена"],
                    ] as [FurnitureCountertop, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={input.countertop === v}
                      disabled={!canWrite}
                      onClick={() => patch({ countertop: v })}
                      className={cn(
                        "flex-1 rounded-sm text-xs font-medium transition-colors duration-150",
                        input.countertop === v
                          ? "bg-panel text-foreground dark:bg-foreground/[0.1]"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {input.countertop === "ldsp" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    До 3 м — 1 лист, длиннее — 2 листа
                  </p>
                )}
              </div>

              {input.countertop === "manual" && (
                <div>
                  <Label htmlFor="fc-countertop">Столешница, себестоимость ₸</Label>
                  <Input
                    id="fc-countertop"
                    type="number"
                    min={0}
                    disabled={!canWrite}
                    value={input.countertopManualCost || ""}
                    onChange={(e) => patch({ countertopManualCost: Number(e.target.value) || 0 })}
                  />
                </div>
              )}

              <div>
                <Label>Петли</Label>
                <Select
                  value={input.hingeItemId ?? ""}
                  disabled={!canWrite}
                  onValueChange={(v) => patch({ hingeItemId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите петли" />
                  </SelectTrigger>
                  <SelectContent>
                    {hingeItems.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name.replace("Навесы: ", "")} · {formatKzt(p.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className={cn(!hasDrawers && "opacity-60")}>
                <Label>Направляющие ящиков</Label>
                <Select
                  value={input.slideItemId ?? ""}
                  disabled={!canWrite}
                  onValueChange={(v) => patch({ slideItemId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите направляющие" />
                  </SelectTrigger>
                  <SelectContent>
                    {slideItems.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name.replace("Направляющие: ", "")} · {formatKzt(p.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!hasDrawers && (
                  <p className="mt-1 text-xs text-muted-foreground">Пригодится для модулей с ящиками</p>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Поворот деталей при раскрое
                  <span className="block text-xs text-muted-foreground">
                    Выключите для древесных декоров, чтобы текстура шла вдоль
                  </span>
                </span>
                <Switch
                  checked={input.allowRotation}
                  disabled={!canWrite}
                  onCheckedChange={(c) => patch({ allowRotation: c })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Транспортные расходы
                  <span className="block text-xs text-muted-foreground">
                    {formatKzt(prices.find((p) => p.code === "transport")?.price ?? 0)} на проект
                  </span>
                </span>
                <Switch
                  checked={input.includeTransport}
                  disabled={!canWrite}
                  onCheckedChange={(c) => patch({ includeTransport: c })}
                />
              </label>
            </div>

            <div className="calculator-inset mt-5 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Цвет в 3D</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Только для визуализации, на цену не влияет
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <FinishPicker
                  label="Корпус"
                  value={input.carcassColor ?? DEFAULT_CARCASS_FINISH}
                  disabled={!canWrite}
                  onChange={(k) => patch({ carcassColor: k })}
                />
                <FinishPicker
                  label="Фасады"
                  value={input.facadeColor ?? defaultFacadeFinish(input.facadeMaterial)}
                  disabled={!canWrite || input.facadeMaterial === "none"}
                  onChange={(k) => patch({ facadeColor: k })}
                />
              </div>
            </div>
          </Section>

          <Section
            id="cutting"
            title="Раскрой"
            description={
              r && r.sheets.length > 0
                ? `${r.sheets.length} ${r.sheets.length === 1 ? "лист" : r.sheets.length < 5 ? "листа" : "листов"}, средняя загрузка ${Math.round(
                    r.sheets.reduce((s, x) => s + x.utilization, 0) / r.sheets.length,
                  )}%`
                : undefined
            }
          >
            <Tabs defaultValue="map">
              <TabsList>
                <TabsTrigger value="map">Карта раскроя</TabsTrigger>
                <TabsTrigger value="parts">Детали</TabsTrigger>
              </TabsList>
              <TabsContent value="map" className="mt-4">
                <CuttingMap sheets={r?.sheets ?? []} prices={prices} />
              </TabsContent>
              <TabsContent value="parts" className="mt-4">
                <PartsTable parts={r?.parts ?? []} />
              </TabsContent>
            </Tabs>
          </Section>

          <Section
            id="counts"
            title="Количества"
            description="Считаются автоматически. Введите число, чтобы заменить расчёт вручную"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {r &&
                Object.entries(r.nestedSheetCounts).map(([materialId, auto]) => (
                  <OverrideField
                    key={materialId}
                    label={`${priceById.get(materialId)?.name.split(" — ")[0] ?? "ЛДСП"}, листов`}
                    auto={auto}
                    value={input.overrides.sheets[materialId]}
                    disabled={!canWrite}
                    onChange={(v) => setSheetOverride(materialId, v)}
                  />
                ))}
              {COUNT_KEYS.map((key) => (
                <OverrideField
                  key={key}
                  label={COUNT_LABELS[key]}
                  auto={r?.autoCounts[key] ?? 0}
                  value={input.overrides.counts[key]}
                  disabled={!canWrite}
                  onChange={(v) => setCount(key, v)}
                />
              ))}
            </div>
          </Section>

          <Section
            id="extras"
            title="Дополнительно"
            description="Подъёмники, бутылочницы, сушки, фиксы и любые свои позиции по себестоимости"
          >
            <div className="space-y-2">
              {input.extras.map((e) => (
                <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_80px_110px_36px] items-center gap-2">
                  <Select
                    value={e.priceItemId ?? "custom"}
                    disabled={!canWrite}
                    onValueChange={(v) => {
                      const item = priceById.get(v);
                      setInput((q) => ({
                        ...q,
                        extras: q.extras.map((x) =>
                          x.id === e.id
                            ? item
                              ? { ...x, priceItemId: item.id, name: item.name, unitPrice: item.price }
                              : { ...x, priceItemId: null }
                            : x,
                        ),
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Своя позиция…</SelectItem>
                      {extraItems.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {formatKzt(p.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    aria-label="Количество"
                    disabled={!canWrite}
                    value={e.quantity || ""}
                    onChange={(ev) =>
                      setInput((q) => ({
                        ...q,
                        extras: q.extras.map((x) =>
                          x.id === e.id ? { ...x, quantity: Number(ev.target.value) || 0 } : x,
                        ),
                      }))
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    aria-label="Цена за единицу"
                    disabled={!canWrite}
                    value={e.unitPrice || ""}
                    onChange={(ev) =>
                      setInput((q) => ({
                        ...q,
                        extras: q.extras.map((x) =>
                          x.id === e.id ? { ...x, unitPrice: Number(ev.target.value) || 0 } : x,
                        ),
                      }))
                    }
                  />
                  {canWrite && (
                    <button
                      type="button"
                      aria-label="Удалить позицию"
                      onClick={() =>
                        setInput((q) => ({ ...q, extras: q.extras.filter((x) => x.id !== e.id) }))
                      }
                      className="grid size-9 place-items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                  {e.priceItemId === null && (
                    <Input
                      className="col-span-3"
                      placeholder="Название позиции"
                      disabled={!canWrite}
                      value={e.name}
                      onChange={(ev) =>
                        setInput((q) => ({
                          ...q,
                          extras: q.extras.map((x) =>
                            x.id === e.id ? { ...x, name: ev.target.value } : x,
                          ),
                        }))
                      }
                    />
                  )}
                </div>
              ))}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    const item = extraItems[0];
                    patch({
                      extras: [
                        ...input.extras,
                        {
                          id: generateId("ext"),
                          priceItemId: item?.id ?? null,
                          name: item?.name ?? "",
                          unitPrice: item?.price ?? 0,
                          quantity: 1,
                        },
                      ],
                    });
                  }}
                  className="touch-manipulation inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 text-base text-foreground transition-none active:bg-foreground/10"
                >
                  <Plus className="size-4" /> Добавить позицию
                </button>
              )}
            </div>
          </Section>
        </CalculatorSectionLayout>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <div className="calculator-block p-4 sm:p-5">{summary}</div>
          </div>
        </aside>
      </div>

      <div className="h-16 lg:hidden" aria-hidden />
      <div className="material fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 border-t border-foreground/[0.06] px-4 py-2.5 md:bottom-0 lg:hidden">
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          className="flex w-full items-center justify-between gap-3"
        >
          <span className="text-left">
            <span className="block text-xs text-muted-foreground">
              {quote.modules.reduce((s, m) => s + m.quantity, 0)} мод. ·{" "}
              {r ? Object.values(r.nestedSheetCounts).reduce((s, n) => s + n, 0) : 0} л. ЛДСП
            </span>
            <span className="text-lg font-semibold tabular-nums">{formatKzt(quote.total)}</span>
          </span>
          <span className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Итог <ChevronUp className="size-4" />
          </span>
        </button>
      </div>

      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl lg:hidden">
          <SheetHeader>
            <SheetTitle>Итог расчёта</SheetTitle>
          </SheetHeader>
          <div className="mt-4 pb-4">{summary}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
