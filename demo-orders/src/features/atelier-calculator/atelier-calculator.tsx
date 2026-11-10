"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDateRu, formatKzt, formatMeters } from "@/lib/utils";
import {
  emptyInstall,
  emptyQuote,
  emptyRoom,
  newId,
  recalculateAtelierQuote,
  roomBreakdown,
} from "@/lib/domain/atelier-calc";
import type {
  MediaItem,
  AtelierAccessoryPrice,
  AtelierAssemblyCoeff,
  AtelierCornicePrice,
  AtelierCoverPrice,
  AtelierFabric,
  AtelierInstallPrice,
  AtelierLabels,
  AtelierPillowPrice,
  AtelierQuoteSnapshot,
  AtelierRollerPrice,
  AtelierRoom,
  AtelierServicePrices,
  AtelierStoredQuote,
} from "@/types";
import {
  ATELIER_BLIND_LABELS,
  ATELIER_CORNICE_LABELS,
  ATELIER_FORGED_COLOR_LABELS,
  ATELIER_SELECTABLE_STATUSES,
  ATELIER_ORDER_STATUS_LABELS,
  SOURCE_LABELS,
} from "@/types";
import type { LeadSource, AtelierBlindKind, AtelierOrderStatus } from "@/types";
import { InstallFields, NumberField, Section } from "./fields";
import { FabricBlock } from "./fabric-block";
import { RoomsBar } from "./rooms-bar";
import { RoomPhotos } from "./room-photos";
import { ProposalRoomsDialog } from "./proposal-rooms-dialog";
import { CurtainStylePicker } from "./curtain-style-picker";
import { CalculatorSectionLayout } from "@/components/calculator/sortable-sections";

type Catalog = {
  cornices: AtelierCornicePrice[];
  fabrics: AtelierFabric[];
  coeffs: AtelierAssemblyCoeff[];
  covers: AtelierCoverPrice[];
  pillows: AtelierPillowPrice[];
  accessories: AtelierAccessoryPrice[];
  rollers: AtelierRollerPrice[];
  installs: AtelierInstallPrice[];
  servicePrices: AtelierServicePrices;
};

type ClientOpt = {
  id: string;
  fullName: string;
  phone: string;
  address?: string | null;
  source?: LeadSource;
  sourceNote?: string | null;
};

type Props = {
  clients: ClientOpt[];
  catalog: Catalog;
  labels: AtelierLabels;
  canWrite: boolean;
  companyName: string;
  initialOrderId?: string | null;
  initialQuote?: AtelierStoredQuote | null;
  initialMedia?: MediaItem[];
  sourceProposalNumber?: string | null;
  initialStatus?: AtelierOrderStatus | null;
  initialSewingRoomIds?: string[] | null;
};

type RoomListKey = "cornices" | "covers" | "pillows" | "accessories" | "rollers";
type SaveState = "idle" | "saving" | "saved" | "error";

const SECTIONS = [
  { id: "client", label: "Клиент" },
  { id: "rooms", label: "Комнаты" },
  { id: "cornice", label: "Карниз" },
  { id: "curtain-type", label: "Тип" },
  { id: "tulle", label: "Тюль" },
  { id: "portiere", label: "Портьера" },
  { id: "covers", label: "Покрывала" },
  { id: "pillows", label: "Подушки" },
  { id: "accessories", label: "Аксессуары" },
  { id: "rollers", label: "Ролл-шторы" },
  { id: "blinds", label: "Жалюзи" },
  { id: "photos", label: "Фото" },
  { id: "total", label: "Итог" },
] as const;

const SOURCES = Object.keys(SOURCE_LABELS) as LeadSource[];

/** Stable key for "did the user change anything" — recalculation timestamps excluded. */
const quoteKey = (q: AtelierQuoteSnapshot) => JSON.stringify({ ...q, calculatedAt: null });

type AtelierDraft = {
  quote: AtelierStoredQuote;
  activeRoomId: string;
  media: MediaItem[];
  orderId: string | null;
  orderStatus: AtelierOrderStatus;
  sourceProposalNumber: string | null;
};

function readAtelierDraft(raw: string): AtelierDraft | null {
  const parsed = JSON.parse(raw) as AtelierDraft & AtelierStoredQuote;
  if (parsed?.quote?.rooms) return parsed;
  if (parsed?.rooms) {
    return {
      quote: parsed,
      activeRoomId: parsed.rooms[0]?.id ?? "",
      media: [],
      orderId: null,
      orderStatus: "draft",
      sourceProposalNumber: null,
    };
  }
  return null;
}

/** Plain /calculator keeps the session. An explicit other order or КП replaces it. */
function shouldRestoreAtelierDraft(
  session: AtelierDraft | null,
  initialOrderId: string | null | undefined,
  sourceProposalNumber: string | null | undefined,
): session is AtelierDraft {
  if (!session) return false;
  if (sourceProposalNumber) return session.sourceProposalNumber === sourceProposalNumber;
  if (initialOrderId) return session.orderId === initialOrderId;
  return true;
}

export function AtelierCalculator({
  clients,
  catalog,
  labels,
  canWrite,
  companyName,
  initialOrderId,
  initialQuote,
  initialMedia,
  sourceProposalNumber,
  initialStatus,
  initialSewingRoomIds,
}: Props) {
  const router = useRouter();
  const [orderId, setOrderId] = useState<string | null>(initialOrderId ?? null);
  const [quote, setQuote] = useState<AtelierQuoteSnapshot>(() =>
    initialQuote ? recalculateAtelierQuote(initialQuote) : emptyQuote(),
  );
  const [activeRoomId, setActiveRoomId] = useState(() => quote.rooms[0]?.id ?? "");
  const [media, setMedia] = useState<MediaItem[]>(initialMedia ?? []);
  const [pending, setPending] = useState(false);
  const [activeSection, setActiveSection] = useState("client");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [sewingRoomIds, setSewingRoomIds] = useState<string[] | null>(initialSewingRoomIds ?? null);
  const [orderStatus, setOrderStatus] = useState<AtelierOrderStatus>(initialStatus ?? "draft");
  /** The status is sent only after a manual pick, so a stale value never overrides the workshop. */
  const [statusTouched, setStatusTouched] = useState(false);
  const statusOptions: AtelierOrderStatus[] = ATELIER_SELECTABLE_STATUSES.includes(orderStatus)
    ? [...ATELIER_SELECTABLE_STATUSES]
    : [...ATELIER_SELECTABLE_STATUSES, orderStatus];
  const [extraFabrics, setExtraFabrics] = useState<AtelierFabric[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [draftProposal, setDraftProposal] = useState<string | null>(sourceProposalNumber ?? null);
  const [draftRestored, setDraftRestored] = useState(false);
  const lastSavedKey = useRef<string | null>(null);

  const room = quote.rooms.find((r) => r.id === activeRoomId) ?? quote.rooms[0];
  const draftKey = `atelier-draft:${companyName}`;
  const autosave = Boolean(orderId) && canWrite && !draftProposal;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      const session = raw ? readAtelierDraft(raw) : null;
      if (shouldRestoreAtelierDraft(session, initialOrderId, sourceProposalNumber)) {
        const restored = recalculateAtelierQuote(session.quote);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore draft after hydration
        setQuote(restored);
        setActiveRoomId(session.activeRoomId || restored.rooms[0]?.id || "");
        setMedia(session.media ?? []);
        setOrderId(session.orderId);
        setOrderStatus(session.orderStatus ?? "draft");
        setDraftProposal(session.sourceProposalNumber);
      }
    } catch {
      /* ignore broken draft */
    }
    setDraftRestored(true);
  }, [draftKey, initialOrderId, sourceProposalNumber]);

  useEffect(() => {
    if (!draftRestored) return;
    const session: AtelierDraft = {
      quote,
      activeRoomId,
      media,
      orderId,
      orderStatus,
      sourceProposalNumber: draftProposal,
    };
    try {
      localStorage.setItem(draftKey, JSON.stringify(session));
    } catch {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ ...session, media: [] }));
      } catch {
        /* ignore quota */
      }
    }
  }, [quote, activeRoomId, media, orderId, orderStatus, draftProposal, draftKey, draftRestored]);

  useEffect(() => {
    if (!autosave) return;
    const key = quoteKey(quote);
    if (lastSavedKey.current === null) {
      lastSavedKey.current = key;
      return;
    }
    if (key === lastSavedKey.current) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/atelier/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, quote, action: "draft" }),
        });
        if (!res.ok) throw new Error();
        lastSavedKey.current = key;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [autosave, orderId, quote]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.2, 0.5] },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const installMap = useMemo(() => {
    const m: Record<string, AtelierInstallPrice> = {};
    for (const i of catalog.installs) m[i.section] = i;
    return m;
  }, [catalog.installs]);

  function patch(p: Partial<AtelierQuoteSnapshot>) {
    setQuote((q) => recalculateAtelierQuote({ ...q, ...p }));
  }

  function patchRoomById(id: string, p: Partial<AtelierRoom>) {
    setQuote((q) =>
      recalculateAtelierQuote({
        ...q,
        rooms: q.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)),
      }),
    );
  }

  function patchRoom(p: Partial<AtelierRoom>) {
    if (room) patchRoomById(room.id, p);
  }

  function updateLine<K extends RoomListKey>(
    key: K,
    id: string,
    p: Partial<AtelierRoom[K][number]>,
  ) {
    const lines = room[key] as AtelierRoom[K][number][];
    patchRoom({ [key]: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  }

  function removeLine(key: RoomListKey, id: string) {
    const lines = room[key] as { id: string }[];
    patchRoom({ [key]: lines.filter((l) => l.id !== id) });
  }

  function addRoom() {
    const next = emptyRoom(`Комната ${quote.rooms.length + 1}`);
    patch({ rooms: [...quote.rooms, next] });
    setActiveRoomId(next.id);
  }

  function removeRoom(id: string) {
    const rest = quote.rooms.filter((r) => r.id !== id);
    if (!rest.length) return;
    patch({ rooms: rest });
    if (activeRoomId === id) setActiveRoomId(rest[0].id);
  }

  async function submit(
    action: "calculate" | "draft" | "proposal" | "workshop",
    roomIds?: string[],
    targetOrderId: string | null = orderId,
  ): Promise<string | null> {
    if (!canWrite) return null;
    if (action !== "calculate" && !quote.clientName.trim() && !quote.clientId) {
      toast.error("Укажите клиента");
      return null;
    }
    setPending(true);
    try {
      const res = await fetch("/api/atelier/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: targetOrderId,
            quote,
            action,
            roomIds,
            status: statusTouched ? orderStatus : undefined,
          }),
      });
      const data = await res.json();
      if (data.order?.status) setOrderStatus(data.order.status as AtelierOrderStatus);
      if (data.order?.id && data.order.id !== targetOrderId) {
        setOrderId(data.order.id);
        window.history.replaceState(null, "", `/calculator?order=${data.order.id}`);
      }
      if (!res.ok) throw new Error(data.error || "Ошибка");
      if (action !== "calculate") setStatusTouched(false);
      if (data.quote) {
        const saved = recalculateAtelierQuote(data.quote);
        setQuote(saved);
        if (action !== "calculate") lastSavedKey.current = quoteKey(saved);
      }
      if (action === "calculate") toast.success("Расчёт обновлён");
      if (action === "draft") toast.success("Расчёт сохранён в карточке клиента");
      if (action === "proposal" && data.proposal) {
        toast.success(`КП ${data.proposal.number} сохранено`);
        setProposalOpen(false);
        router.push(`/proposals/${data.proposal.id}`);
      }
      return data.order?.id ?? targetOrderId;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function ensureOrder(fresh = false): Promise<string | null> {
    if (orderId && !fresh) return orderId;
    return submit("draft", undefined, fresh ? null : orderId);
  }

  function startNew() {
    const fresh = emptyQuote();
    setOrderId(null);
    setQuote(fresh);
    setActiveRoomId(fresh.rooms[0]?.id ?? "");
    setMedia([]);
    setOrderStatus("draft");
    setStatusTouched(false);
    setDraftProposal(null);
    setSaveState("idle");
    setExtraFabrics([]);
    lastSavedKey.current = null;
    window.history.replaceState(null, "", "/calculator");
  }

  function pickClient(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    patch({
      clientId: c.id,
      clientName: c.fullName,
      clientPhone: c.phone,
      address: c.address ?? quote.address,
      leadSource: c.source ?? quote.leadSource,
      leadSourceNote: c.sourceNote ?? quote.leadSourceNote,
    });
  }

  const corniceWidth = room?.cornices.find((line) => line.meters > 0)?.meters ?? room?.cornices[0]?.meters ?? 0;

  function setCorniceMeters(id: string, meters: number) {
    if (!room) return;
    const sync = <T extends { meterageMode?: string; widthManual?: boolean; width: number }>(lines: T[]) =>
      lines.map((line) =>
        line.meterageMode === "width_coeff" && !line.widthManual ? { ...line, width: meters } : line,
      );
    patchRoom({
      cornices: room.cornices.map((line) => (line.id === id ? { ...line, meters } : line)),
      tulle: sync(room.tulle),
      portiere: sync(room.portiere),
    });
  }

  async function createFabric(input: { name: string; salePrice: number; type: "tulle" | "portiere" }) {
    const res = await fetch("/api/atelier/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Не удалось создать ткань");
      return null;
    }
    setExtraFabrics((list) => [...list, data.fabric]);
    toast.success("Ткань добавлена в справочник и на склад");
    return data.fabric;
  }

  function askWorkshop() {
    if (!quote.clientName.trim() && !quote.clientId) {
      toast.error("Укажите клиента");
      return;
    }
    setWorkshopOpen(true);
  }

  async function sendToWorkshop(roomIds: string[]) {
    const saved = await submit("draft");
    if (!saved) return;
    const res = await fetch(`/api/orders/${saved}/sewing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.order?.status) setOrderStatus(data.order.status as AtelierOrderStatus);
    if (!res.ok) {
      toast.error(data.error || "Не удалось передать в цех");
      return;
    }
    setSewingRoomIds(roomIds);
    setWorkshopOpen(false);
    toast.success(
      data.alreadySent
        ? `Комнаты в цехе обновлены: ${data.order.number}`
        : `Заказ ${data.order.number} передан в цех, уведомлено швей: ${data.notified}`,
    );
  }

  const standardCornices = catalog.cornices.filter((c) => c.kind !== "forged");
  const forgedCornices = catalog.cornices.filter((c) => c.kind === "forged");
  const roomTitle = room?.name.trim() || "Без названия";
  const fabricShared = {
    fabrics: [...catalog.fabrics, ...extraFabrics],
    coeffs: catalog.coeffs,
    servicePrices: catalog.servicePrices,
    labels,
    installSale: installMap.curtains?.salePrice ?? 0,
    installCost: installMap.curtains?.costPrice ?? 0,
    canWrite,
    corniceWidth,
    onCreateFabric: createFabric,
  };

  if (!room) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{companyName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Калькулятор заказа
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {draftProposal
            ? `Открыт расчёт из ${draftProposal}. Новое КП не изменит сохранённое.`
            : "Расчёт по комнатам: тюль и портьера считаются отдельно. Все размеры в метрах."}
        </p>
        {autosave && saveState !== "idle" && (
          <p
            className={cn(
              "mt-1 text-xs",
              saveState === "error" ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {saveState === "saving" && "Сохраняем изменения…"}
            {saveState === "saved" && "Изменения сохранены"}
            {saveState === "error" && "Не удалось сохранить изменения — нажмите «Сохранить»"}
          </p>
        )}
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={startNew}
            className="shrink-0 text-sm text-primary underline-offset-2 hover:underline"
          >
            Новый расчёт
          </button>
        )}
      </div>

      <nav className="sticky top-14 z-20 -mx-1 overflow-x-auto rounded-lg border border-border bg-panel/95 px-2 py-2 backdrop-blur">
        <div className="flex gap-1">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                activeSection === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="overflow-x-clip">
      <CalculatorSectionLayout storageKey="calculator-section-order:atelier" ids={SECTIONS.map((section) => section.id)} className="px-3 py-3">
      <Section id="client" title="Клиент">
              <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Откуда пришёл клиент</Label>
            <Select
              value={quote.leadSource ?? ""}
              disabled={!canWrite}
              onValueChange={(value) => patch({ leadSource: value as LeadSource })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {SOURCE_LABELS[source]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {quote.leadSource === "other" ? (
            <div className="sm:col-span-2">
              <Label>Свой вариант источника</Label>
              <Input
                value={quote.leadSourceNote ?? ""}
                disabled={!canWrite}
                onChange={(e) => patch({ leadSourceNote: e.target.value })}
              />
            </div>
          ) : null}
          <div>
            <Label>Статус заказа</Label>
            <Select
              value={orderStatus}
              disabled={!canWrite}
              onValueChange={(value) => {
                setOrderStatus(value as AtelierOrderStatus);
                setStatusTouched(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ATELIER_ORDER_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Выбрать из базы</Label>
            <Select value={quote.clientId ?? ""} onValueChange={pickClient} disabled={!canWrite}>
                <SelectTrigger>
                  <SelectValue />
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
            <Label>Имя</Label>
            <Input
              value={quote.clientName}
              disabled={!canWrite}
              onChange={(e) => patch({ clientName: e.target.value, clientId: null })}
            />
          </div>
          <div>
            <Label>Телефон</Label>
            <Input
              value={quote.clientPhone}
              type="tel"
              disabled={!canWrite}
              onChange={(e) => patch({ clientPhone: e.target.value })}
            />
          </div>
          <div>
            <Label>Адрес</Label>
            <Input
              value={quote.address}
              disabled={!canWrite}
              onChange={(e) => patch({ address: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="atelier-measurement-date">Дата замера</Label>
            <Input
              id="atelier-measurement-date"
              type="date"
              value={quote.measurementDate ?? ""}
              disabled={!canWrite}
              onChange={(e) => patch({ measurementDate: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Дедлайн</Label>
            <Input
              type="date"
              value={quote.deadline}
              disabled={!canWrite}
              onChange={(e) => patch({ deadline: e.target.value })}
            />
          </div>
        </div>
      </Section>

      <Section
        id="rooms"
        title="Комнаты"
        aside={
          <p className="text-sm text-muted-foreground">
            {quote.rooms.length} · итого {formatKzt(quote.subtotal)}
          </p>
        }
      >
        <RoomsBar
          rooms={quote.rooms}
          activeId={room.id}
          canWrite={canWrite}
          onSelect={setActiveRoomId}
          onAdd={addRoom}
          onRename={(id, name) => patchRoomById(id, { name })}
          onRemove={removeRoom}
        />
      </Section>

      <Section id="cornice" title={`Карниз · ${roomTitle}`}>
        {room.cornices.map((line, idx) => (
          <div key={line.id} className="calculator-inset space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Карниз №{idx + 1}</p>
              {canWrite && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine("cornices", line.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <Label>Тип</Label>
                <Select
                  value={line.kind === "forged" ? line.priceId : line.kind}
                  disabled={!canWrite}
                  onValueChange={(v) => {
                    const forged = forgedCornices.find((c) => c.id === v);
                    const std = standardCornices.find((c) => c.kind === v);
                    const price = forged ?? std;
                    if (!price) return;
                    updateLine("cornices", line.id, {
                      priceId: price.id,
                      kind: price.kind,
                      label: price.label,
                      forgedColor: price.forgedColor,
                      salePerMeter: price.salePricePerMeter,
                      costPerMeter: price.costPricePerMeter,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {standardCornices.map((c) => (
                      <SelectItem key={c.id} value={c.kind}>
                        {ATELIER_CORNICE_LABELS[c.kind]}
                      </SelectItem>
                    ))}
                    {forgedCornices.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        Кованый {c.rows}-ряд ·{" "}
                        {c.forgedColor ? ATELIER_FORGED_COLOR_LABELS[c.forgedColor] : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Длина"
                unit="п.м."
                value={line.meters}
                disabled={!canWrite}
                onChange={(meters) => setCorniceMeters(line.id, meters)}
              />
              <NumberField
                label="Цена"
                unit="₸/п.м."
                value={line.salePerMeter}
                disabled={!canWrite}
                onChange={(salePerMeter) => updateLine("cornices", line.id, { salePerMeter })}
              />
            </div>
            <p className="text-sm text-muted-foreground">Итого: {formatKzt(line.lineTotal)}</p>
            <InstallFields
              label={labels["install.cornice"]}
              value={line.install}
              defaultSale={installMap.cornice?.salePrice ?? 0}
              defaultCost={installMap.cornice?.costPrice ?? 0}
              disabled={!canWrite}
              onChange={(install) => updateLine("cornices", line.id, { install })}
            />
          </div>
        ))}
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const price = standardCornices[0];
              if (!price) return;
              patchRoom({
                cornices: [
                  ...room.cornices,
                  {
                    id: newId("cn"),
                    priceId: price.id,
                    kind: price.kind,
                    label: price.label,
                    forgedColor: null,
                    meters: 0,
                    salePerMeter: price.salePricePerMeter,
                    costPerMeter: price.costPricePerMeter,
                    lineTotal: 0,
                    lineCost: 0,
                    install: emptyInstall(),
                  },
                ],
              });
            }}
          >
            <Plus className="mr-1 size-4" /> Добавить ещё
          </Button>
        )}
      </Section>


      <Section id="curtain-type" title={`Тип · ${roomTitle}`}>
        <CurtainStylePicker
          selected={room.curtainStyleIds ?? []}
          disabled={!canWrite}
          onChange={(curtainStyleIds) => patchRoom({ curtainStyleIds })}
        />
      </Section>

      <Section
        id="tulle"
        title={`Тюль · ${roomTitle}`}
        aside={
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatKzt(room.tulle.reduce((s, l) => s + l.total, 0))}
          </p>
        }
      >
        <FabricBlock
          kind="tulle"
          lines={room.tulle}
          onChange={(tulle) => patchRoom({ tulle })}
          {...fabricShared}
        />
      </Section>

      <Section
        id="portiere"
        title={`Портьера · ${roomTitle}`}
        aside={
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatKzt(room.portiere.reduce((s, l) => s + l.total, 0))}
          </p>
        }
      >
        <FabricBlock
          kind="portiere"
          lines={room.portiere}
          onChange={(portiere) => patchRoom({ portiere })}
          {...fabricShared}
        />
      </Section>

      <Section id="covers" title={`Покрывала · ${roomTitle}`}>
        {room.covers.map((line, idx) => {
          const priceFor = (p: Partial<typeof line>) => {
            const next = { ...line, ...p };
            const price = catalog.covers.find(
              (c) =>
                c.stitch === next.stitch &&
                c.corner === next.corner &&
                c.coverType === next.coverType,
            );
            updateLine("covers", line.id, {
              ...p,
              costPrice: price?.costPrice ?? line.costPrice,
            });
          };
          return (
            <div key={line.id} className="calculator-inset space-y-4 rounded-lg border border-border p-4">
              <div className="flex justify-between">
                <p className="text-sm font-medium">Покрывало №{idx + 1}</p>
                {canWrite && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine("covers", line.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberField
                  label="Ширина"
                  unit="м"
                  value={line.width}
                  disabled={!canWrite}
                  onChange={(width) => updateLine("covers", line.id, { width })}
                />
                <NumberField
                  label="Длина"
                  unit="м"
                  value={line.length}
                  disabled={!canWrite}
                  onChange={(length) => updateLine("covers", line.id, { length })}
                />
                <NumberField
                  label="Провис / высота"
                  unit="м"
                  value={line.overhang}
                  disabled={!canWrite}
                  onChange={(overhang) => updateLine("covers", line.id, { overhang })}
                />
                <div>
                  <Label>Стежка</Label>
                  <Select
                    value={line.stitch}
                    disabled={!canWrite}
                    onValueChange={(v) => priceFor({ stitch: v as typeof line.stitch })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="romb">Ромб</SelectItem>
                      <SelectItem value="square">Квадрат</SelectItem>
                      <SelectItem value="stripe">Полоса</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Угол</Label>
                  <Select
                    value={line.corner}
                    disabled={!canWrite}
                    onValueChange={(v) => priceFor({ corner: v as typeof line.corner })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sharp">Острый</SelectItem>
                      <SelectItem value="round">Круглый</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Тип</Label>
                  <Select
                    value={line.coverType}
                    disabled={!canWrite}
                    onValueChange={(v) => priceFor({ coverType: v as typeof line.coverType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Полуторка</SelectItem>
                      <SelectItem value="one_bed">Односпалка</SelectItem>
                      <SelectItem value="double">Двуспалка</SelectItem>
                      <SelectItem value="custom">Индивидуальный</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Материал</Label>
                  <Select
                    value={line.materialKind ?? ""}
                    disabled={!canWrite}
                    onValueChange={(materialKind) =>
                      updateLine("covers", line.id, { materialKind: materialKind as "sintepon" | "fabric" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sintepon">Синтепон</SelectItem>
                      <SelectItem value="fabric">Ткань</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <NumberField
                  label="Цена"
                  unit="₸"
                  value={line.salePrice}
                  disabled={!canWrite}
                  onChange={(salePrice) => updateLine("covers", line.id, { salePrice })}
                />
                <NumberField
                  label="Пошив"
                  unit="₸"
                  value={line.sewingPrice ?? 0}
                  disabled={!canWrite}
                  onChange={(sewingPrice) => updateLine("covers", line.id, { sewingPrice })}
                />
              </div>
              <p className="text-sm">{formatKzt(line.lineTotal)}</p>
            </div>
          );
        })}
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const price = catalog.covers[0];
              patchRoom({
                covers: [
                  ...room.covers,
                  {
                    id: newId("cv"),
                    width: 0,
                    length: 0,
                    overhang: 0,
                    stitch: "romb",
                    corner: "sharp",
                    coverType: "double",
                    salePrice: 0,
                    costPrice: price?.costPrice ?? 0,
                    lineTotal: 0,
                    lineCost: 0,
                    install: emptyInstall(),
                  },
                ],
              });
            }}
          >
            <Plus className="mr-1 size-4" /> Добавить ещё
          </Button>
        )}
      </Section>

      <Section id="pillows" title={`Подушки · ${roomTitle}`}>
        {room.pillows.map((line, idx) => (
          <div key={line.id} className="calculator-inset space-y-4 rounded-lg border border-border p-4">
            <div className="flex justify-between">
              <p className="text-sm font-medium">Подушка №{idx + 1}</p>
              {canWrite && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine("pillows", line.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label="Ширина"
                unit="м"
                value={line.width}
                disabled={!canWrite}
                onChange={(width) => updateLine("pillows", line.id, { width })}
              />
              <NumberField
                label="Длина"
                unit="м"
                value={line.height}
                disabled={!canWrite}
                onChange={(height) => updateLine("pillows", line.id, { height })}
              />
              <div>
                <Label>Тип</Label>
                <Select
                  value={line.pillowType}
                  disabled={!canWrite}
                  onValueChange={(v) => {
                    const pillowType = v as typeof line.pillowType;
                    const price = catalog.pillows.find((p) => p.pillowType === pillowType);
                    updateLine("pillows", line.id, {
                      pillowType,
                      costPrice: price?.costPrice ?? line.costPrice,
                      ...(line.materialSalePerMeter == null
                        ? { salePrice: price?.salePrice ?? line.salePrice }
                        : {}),
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Наволочка</SelectItem>
                    <SelectItem value="full">Полный комплект</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Количество"
                unit="шт"
                value={line.quantity}
                disabled={!canWrite}
                onChange={(quantity) => updateLine("pillows", line.id, { quantity })}
              />
              <div className="sm:col-span-2 lg:col-span-4">
                <Label>Примечание</Label>
                <Input
                  value={line.note}
                  disabled={!canWrite}
                  onChange={(e) => updateLine("pillows", line.id, { note: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Материал</Label>
                <Select
                  value={line.materialKind ?? ""}
                  disabled={!canWrite}
                  onValueChange={(materialKind) =>
                    updateLine("pillows", line.id, { materialKind: materialKind as "sintepon" | "fabric" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sintepon">Синтепон</SelectItem>
                    <SelectItem value="fabric">Ткань</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Цена"
                unit="₸"
                value={line.materialSalePerMeter ?? line.salePrice}
                disabled={!canWrite}
                onChange={(materialSalePerMeter) => updateLine("pillows", line.id, { materialSalePerMeter })}
              />
              <NumberField
                label="Наполнитель, кол-во"
                value={line.fillingQty ?? 0}
                disabled={!canWrite}
                onChange={(fillingQty) => updateLine("pillows", line.id, { fillingQty })}
              />
              <NumberField
                label="Пошив подушки"
                unit="₸"
                value={line.sewPillow ?? 0}
                disabled={!canWrite}
                onChange={(sewPillow) => updateLine("pillows", line.id, { sewPillow })}
              />
            </div>
            <p className="text-sm">{formatKzt(line.lineTotal)}</p>
          </div>
        ))}
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const price = catalog.pillows.find((p) => p.pillowType === "cover");
              patchRoom({
                pillows: [
                  ...room.pillows,
                  {
                    id: newId("pl"),
                    width: 0.5,
                    height: 0.7,
                    pillowType: "cover",
                    quantity: 1,
                    note: "",
                    salePrice: price?.salePrice ?? 0,
                    costPrice: price?.costPrice ?? 0,
                    lineTotal: 0,
                    lineCost: 0,
                    install: emptyInstall(),
                  },
                ],
              });
            }}
          >
            <Plus className="mr-1 size-4" /> Добавить ещё
          </Button>
        )}
      </Section>

      <Section id="accessories" title={`Аксессуары · ${roomTitle}`}>
        {room.accessories.map((line, idx) => (
          <div key={line.id} className="calculator-inset space-y-4 rounded-lg border border-border p-4">
            <div className="flex justify-between">
              <p className="text-sm font-medium">Аксессуар №{idx + 1}</p>
              {canWrite && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine("accessories", line.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Позиция</Label>
                <Select
                  value={line.kind}
                  disabled={!canWrite}
                  onValueChange={(v) => {
                    const kind = v as typeof line.kind;
                    const price = catalog.accessories.find(
                      (a) => a.kind === kind && a.color === line.color,
                    );
                    updateLine("accessories", line.id, {
                      kind,
                      label: price?.label ?? line.label,
                      salePrice: price?.salePrice ?? line.salePrice,
                      costPrice: price?.costPrice ?? line.costPrice,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="side_hooks">Боковые крючки</SelectItem>
                    <SelectItem value="fabric_tiebacks">Подхваты тканевые</SelectItem>
                    <SelectItem value="decorative_tassels">Декоративные кисти</SelectItem>
                    <SelectItem value="rings">Обхваты</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Цвет</Label>
                <Select
                  value={line.color}
                  disabled={!canWrite}
                  onValueChange={(v) => {
                    const color = v as typeof line.color;
                    const price = catalog.accessories.find(
                      (a) => a.kind === line.kind && a.color === color,
                    );
                    updateLine("accessories", line.id, {
                      color,
                      salePrice: price?.salePrice ?? line.salePrice,
                      costPrice: price?.costPrice ?? line.costPrice,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gold">Золото</SelectItem>
                    <SelectItem value="bronze">Бронза</SelectItem>
                    <SelectItem value="chrome">Хром</SelectItem>
                    <SelectItem value="white">Белый</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Количество"
                unit="шт"
                value={line.quantity}
                disabled={!canWrite}
                onChange={(quantity) => updateLine("accessories", line.id, { quantity })}
              />
              <NumberField
                label="Цена"
                unit="₸/шт"
                value={line.salePrice}
                disabled={!canWrite}
                onChange={(salePrice) => updateLine("accessories", line.id, { salePrice })}
              />
            </div>
            <p className="text-sm">Итог: {formatKzt(line.lineTotal)}</p>
            {line.kind === "side_hooks" ? (
              <InstallFields
                label="Установка крючков"
                value={line.install}
                defaultSale={installMap.accessories?.salePrice ?? 0}
                defaultCost={installMap.accessories?.costPrice ?? 0}
                disabled={!canWrite}
                onChange={(install) => updateLine("accessories", line.id, { install })}
              />
            ) : null}
          </div>
        ))}
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const price = catalog.accessories[0];
              patchRoom({
                accessories: [
                  ...room.accessories,
                  {
                    id: newId("ac"),
                    kind: price?.kind ?? "side_hooks",
                    label: price?.label ?? "Боковые крючки",
                    color: price?.color ?? "gold",
                    quantity: 1,
                    salePrice: price?.salePrice ?? 0,
                    costPrice: price?.costPrice ?? 0,
                    lineTotal: 0,
                    lineCost: 0,
                    install: emptyInstall(),
                  },
                ],
              });
            }}
          >
            <Plus className="mr-1 size-4" /> Добавить ещё
          </Button>
        )}
      </Section>

      <Section id="rollers" title={`Ролл-шторы · ${roomTitle}`}>
        {room.rollers.map((line, idx) => {
          const priceFor = (p: Partial<typeof line>) => {
            const next = { ...line, ...p };
            const price = catalog.rollers.find(
              (r) =>
                r.panel === next.panel &&
                r.mount === next.mount &&
                r.mechanismColor === next.mechanismColor,
            );
            updateLine("rollers", line.id, {
              ...p,
              costPerSqm: price?.costPricePerSqm ?? line.costPerSqm,
            });
          };
          return (
            <div key={line.id} className="calculator-inset space-y-4 rounded-lg border border-border p-4">
              <div className="flex justify-between">
                <p className="text-sm font-medium">Ролл-штора №{idx + 1}</p>
                {canWrite && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine("rollers", line.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <NumberField
                  label="Ширина"
                  unit="м"
                  value={line.width}
                  disabled={!canWrite}
                  onChange={(width) => updateLine("rollers", line.id, { width })}
                />
                <NumberField
                  label="Высота"
                  unit="м"
                  value={line.height}
                  disabled={!canWrite}
                  onChange={(height) => updateLine("rollers", line.id, { height })}
                />
                <div>
                  <Label>Вид</Label>
                  <Select
                    value={line.panel}
                    disabled={!canWrite}
                    onValueChange={(v) => priceFor({ panel: v as typeof line.panel })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Сплошное полотно</SelectItem>
                      <SelectItem value="day_night">День-ночь</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Крепление</Label>
                  <Select
                    value={line.mount}
                    disabled={!canWrite}
                    onValueChange={(v) => priceFor({ mount: v as typeof line.mount })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wall">Стена</SelectItem>
                      <SelectItem value="ceiling">Потолок</SelectItem>
                      <SelectItem value="sash">Створка</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Цвет механизма</Label>
                  <Select
                    value={line.mechanismColor}
                    disabled={!canWrite}
                    onValueChange={(v) =>
                      priceFor({ mechanismColor: v as typeof line.mechanismColor })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="white">Белый</SelectItem>
                      <SelectItem value="gold_oak">Золотой дуб</SelectItem>
                      <SelectItem value="brown">Коричневый</SelectItem>
                      <SelectItem value="grey">Серый</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <NumberField
                  label="Цена"
                  unit="₸/м²"
                  value={line.salePerSqm}
                  disabled={!canWrite}
                  onChange={(salePerSqm) => updateLine("rollers", line.id, { salePerSqm })}
                />
              </div>
              <p className="text-sm">
                {formatMeters(line.sqm, "м²")} · {formatKzt(line.lineTotal)}
              </p>
              <InstallFields
                label={labels["install.rollers"]}
                value={line.install}
                defaultSale={installMap.rollers?.salePrice ?? 0}
                defaultCost={installMap.rollers?.costPrice ?? 0}
                disabled={!canWrite}
                onChange={(install) => updateLine("rollers", line.id, { install })}
              />
            </div>
          );
        })}
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const price = catalog.rollers[0];
              patchRoom({
                rollers: [
                  ...room.rollers,
                  {
                    id: newId("rl"),
                    width: 0,
                    height: 0,
                    panel: "solid",
                    mount: "wall",
                    mechanismColor: "white",
                    sqm: 0,
                    salePerSqm: 0,
                    costPerSqm: price?.costPricePerSqm ?? 0,
                    lineTotal: 0,
                    lineCost: 0,
                    install: emptyInstall(),
                  },
                ],
              });
            }}
          >
            <Plus className="mr-1 size-4" /> Добавить ещё
          </Button>
        )}
      </Section>

      <Section id="blinds" title={`Жалюзи · ${roomTitle}`}>
        {(room.blinds ?? []).map((line, idx) => (
          <div key={line.id} className="calculator-inset space-y-4 rounded-lg border border-border p-4">
            <div className="flex justify-between">
              <p className="text-sm font-medium">Жалюзи №{idx + 1}</p>
              {canWrite && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => patchRoom({ blinds: (room.blinds ?? []).filter((item) => item.id !== line.id) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Вид</Label>
                <Select
                  value={line.kind}
                  disabled={!canWrite}
                  onValueChange={(kind) =>
                    patchRoom({
                      blinds: (room.blinds ?? []).map((item) =>
                        item.id === line.id ? { ...item, kind: kind as AtelierBlindKind } : item,
                      ),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ATELIER_BLIND_LABELS) as AtelierBlindKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {ATELIER_BLIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Ширина"
                unit="м"
                value={line.width}
                disabled={!canWrite}
                onChange={(width) =>
                  patchRoom({
                    blinds: (room.blinds ?? []).map((item) => (item.id === line.id ? { ...item, width } : item)),
                  })
                }
              />
              <NumberField
                label="Высота"
                unit="м"
                value={line.height}
                disabled={!canWrite}
                onChange={(height) =>
                  patchRoom({
                    blinds: (room.blinds ?? []).map((item) => (item.id === line.id ? { ...item, height } : item)),
                  })
                }
              />
              <NumberField
                label="Цена"
                unit="₸/м²"
                value={line.salePerSqm}
                disabled={!canWrite}
                onChange={(salePerSqm) =>
                  patchRoom({
                    blinds: (room.blinds ?? []).map((item) =>
                      item.id === line.id ? { ...item, salePerSqm } : item,
                    ),
                  })
                }
              />
            </div>
            <p className="text-sm">
              {formatMeters(line.sqm, "м²")} · {formatKzt(line.lineTotal)}
            </p>
            <InstallFields
              label="Установка"
              value={line.install}
              defaultSale={0}
              defaultCost={0}
              disabled={!canWrite}
              onChange={(install) =>
                patchRoom({
                  blinds: (room.blinds ?? []).map((item) => (item.id === line.id ? { ...item, install } : item)),
                })
              }
            />
          </div>
        ))}
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              patchRoom({
                blinds: [
                  ...(room.blinds ?? []),
                  {
                    id: newId("bl"),
                    kind: "wood",
                    width: 0,
                    height: 0,
                    sqm: 0,
                    salePerSqm: 0,
                    costPerSqm: 0,
                    lineTotal: 0,
                    lineCost: 0,
                    install: emptyInstall(),
                  },
                ],
              })
            }
          >
            <Plus className="mr-1 size-4" /> Добавить жалюзи
          </Button>
        )}
      </Section>

      <Section id="photos" title={`Фото · ${roomTitle}`}>
        <RoomPhotos
          key={room.id}
          orderId={orderId}
          roomId={room.id}
          photos={media.filter((m) => m.roomId === room.id)}
          canWrite={canWrite}
          ensureOrder={ensureOrder}
          onAdded={(items) => setMedia((m) => [...m, ...items])}
          onRemoved={(id) => setMedia((m) => m.filter((x) => x.id !== id))}
        />
      </Section>

      <Section id="total" title="ИТОГ">
        <ul className="calculator-inset divide-y divide-border overflow-hidden rounded-lg border border-border">
          {quote.rooms.map((r) => {
            const b = roomBreakdown(r);
            return (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
                <button
                  type="button"
                  className="text-left text-sm font-medium hover:text-primary"
                  onClick={() => {
                    setActiveRoomId(r.id);
                    document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {r.name.trim() || "Без названия"}
                </button>
                <span className="text-xs text-muted-foreground">
                  материалы {formatKzt(b.materials)} · {labels["sewing.title"].toLowerCase()}{" "}
                  {formatKzt(b.sewing)} · доп. {formatKzt(b.extras)}
                </span>
                <span className="w-full text-sm font-semibold tabular-nums sm:w-auto">
                  {formatKzt(r.subtotal)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <Label>Скидка</Label>
            <Select
              value={String(quote.discountPercent)}
              disabled={!canWrite}
              onValueChange={(v) => patch({ discountPercent: Number(v) })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 5, 10, 15, 20].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d === 0 ? "Без скидки" : `${d}%`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {quote.measurementDate && (
            <p className="text-sm text-muted-foreground">
              Дата замера: {formatDateRu(quote.measurementDate)}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Стоимость до скидки: {formatKzt(quote.subtotal)}
          </p>
          {quote.discountPercent > 0 && (
            <p className="text-sm text-muted-foreground">
              Скидка {quote.discountPercent}%: −{formatKzt(quote.discountAmount)}
            </p>
          )}
          <p className="text-2xl font-semibold tabular-nums">Итого: {formatKzt(quote.total)}</p>
        </div>

        <div className="mt-4">
          <Label htmlFor="order-comment">Комментарий к заказу</Label>
          <Textarea
            id="order-comment"
            value={quote.orderComment ?? ""}
            disabled={!canWrite}
            onChange={(e) => patch({ orderComment: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Попадёт в заказ и в документ для цеха. Швея увидит его в заказе на пошив.
          </p>
        </div>

        {canWrite && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button type="button" className="w-full" disabled={pending} onClick={() => void submit("draft")}>
              Сохранить
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => {
                if (!quote.clientName.trim() && !quote.clientId) {
                  toast.error("Укажите клиента");
                  return;
                }
                setProposalOpen(true);
              }}
            >
              Сформировать КП
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending || orderStatus === "completed"}
              onClick={askWorkshop}
            >
              <Scissors className="mr-1 size-4" aria-hidden />
              Заказ в цех на пошив
            </Button>
            {orderId ? (
              <Button type="button" variant="ghost" className="w-full sm:col-span-2" onClick={() => window.open(`/orders/${orderId}/measure`, "_blank")}>
                Лист замера
              </Button>
            ) : null}
          </div>
        )}
        {orderId && quote.clientId && (
          <p className="mt-2 text-xs text-muted-foreground">
            Расчёт в карточке клиента ·{" "}
            <a className="text-primary hover:underline" href={`/clients/${quote.clientId}`}>
              открыть
            </a>
          </p>
        )}
      </Section>
      </CalculatorSectionLayout>
      </div>

      <ProposalRoomsDialog
        open={proposalOpen}
        onOpenChange={setProposalOpen}
        quote={quote}
        pending={pending}
        audience="client"
        onConfirm={(roomIds) => void submit("proposal", roomIds)}
      />
      <ProposalRoomsDialog
        open={workshopOpen}
        onOpenChange={setWorkshopOpen}
        quote={quote}
        pending={pending}
        initialSelected={sewingRoomIds}
        sentIds={sewingRoomIds}
        title="Комнаты в цех"
        description="В заказ на пошив попадут только отмеченные комнаты. Остальные можно передать позже."
        confirmLabel="Передать в цех"
        totalLabel="Итого по выбранным"
        onConfirm={(roomIds) => void sendToWorkshop(roomIds)}
      />
    </div>
  );
}
