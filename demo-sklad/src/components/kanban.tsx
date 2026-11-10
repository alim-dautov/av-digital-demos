"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor, pointerWithin, closestCorners, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, type SensorProps,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/components/ui";

export type KCol = { id: number; name: string; color: string; footer?: ReactNode };
export type KItem = { id: number; stageId: number; sort: number };

/**
 * Касание: за «ручку» карточки (data-drag-handle) — сразу, без задержки;
 * за саму карточку — долгим нажатием, чтобы обычный свайп скроллил доску.
 */
class SmartTouchSensor extends TouchSensor {
  constructor(props: SensorProps<object>) {
    const t = props.event.target as Element | null;
    const onHandle = !!t?.closest?.("[data-drag-handle]");
    super(onHandle ? { ...props, options: { ...props.options, activationConstraint: { distance: 3 } } } as typeof props : props as typeof props);
  }
}

// Сначала то, что под пальцем (чипы этапов, колонки), иначе ближайший угол
const collision: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  const chip = hit.find((h) => String(h.id).startsWith("chip-"));
  if (chip) return [chip];
  return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith("chip-")) });
};

/**
 * Канбан с перетаскиванием: оптимистичное перемещение, откат при ошибке сервера.
 * sort нового положения — середина между соседями (дробный порядок, без перенумерации).
 * На телефоне: колонки почти во всю ширину, сверху чипы этапов (тап — перейти, бросить карточку на чип — переместить),
 * автопрокрутка доски у краёв экрана во время перетаскивания.
 */
export function Kanban<T extends KItem>({ columns, items, render, onMove, colExtra, canDrag = true }: {
  columns: KCol[]; items: T[]; render: (item: T, dragging?: boolean) => ReactNode;
  onMove: (id: number, stageId: number, sort: number, item: T) => Promise<{ ok: boolean; error?: string } | boolean>;
  colExtra?: (col: KCol, items: T[]) => ReactNode; canDrag?: boolean;
}) {
  const [list, setList] = useState(items);
  const [active, setActive] = useState<T | null>(null);
  const [startStage, setStartStage] = useState<number | null>(null);
  const [visible, setVisible] = useState<number | null>(columns[0]?.id ?? null);
  const scroller = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  useEffect(() => setList(items), [items]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(SmartTouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byCol = useMemo(() => {
    const m = new Map<number, T[]>(columns.map((c) => [c.id, []]));
    for (const it of [...list].sort((a, b) => a.sort - b.sort)) m.get(it.stageId)?.push(it);
    return m;
  }, [list, columns]);

  const scrollToCol = useCallback((id: number, smooth = true) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-col="${id}"]`);
    const box = scroller.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.offsetLeft - parseFloat(getComputedStyle(box).paddingLeft || "0");
    const from = box.scrollLeft;
    box.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
    // где плавная прокрутка не сработала (энергосбережение, старые WebView) — переходим сразу
    if (smooth) setTimeout(() => { if (box.scrollLeft === from && Math.abs(from - left) > 2) box.scrollTo({ left }); }, 450);
  }, []);

  // Какая колонка сейчас на экране — подсвечиваем её чип
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    const cols = [...box.querySelectorAll<HTMLElement>("[data-col]")];
    if (!cols.length) return;
    const x = box.scrollLeft + box.clientWidth * 0.35;
    const cur = cols.reduce((best, c) => (c.offsetLeft - box.offsetLeft <= x ? c : best), cols[0]);
    const id = Number(cur.dataset.col);
    setVisible((v) => (v === id ? v : id));
  };

  // Активный чип всегда виден в ленте чипов
  useEffect(() => {
    const bar = chips.current, chip = bar?.querySelector<HTMLElement>(`[data-chip="${visible}"]`);
    if (!bar || !chip) return;
    if (chip.offsetLeft < bar.scrollLeft || chip.offsetLeft + chip.offsetWidth > bar.scrollLeft + bar.clientWidth)
      bar.scrollTo({ left: chip.offsetLeft - 16, behavior: "smooth" });
  }, [visible]);

  // Мышью можно тянуть доску вбок за пустое место
  const pan = useRef<{ x: number; left: number } | null>(null);
  const onPanDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as Element).closest("[data-kcard],button,a,input,textarea,select,[role=button]")) return;
    pan.current = { x: e.clientX, left: scroller.current?.scrollLeft ?? 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPanMove = (e: React.PointerEvent) => {
    if (!pan.current || !scroller.current) return;
    scroller.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
  };
  const onPanUp = () => { pan.current = null; };

  const colOf = (id: string | number) => {
    const s = String(id);
    if (s.startsWith("col-")) return Number(s.slice(4));
    if (s.startsWith("chip-")) return Number(s.slice(5));
    return list.find((x) => x.id === Number(id))?.stageId ?? null;
  };
  const onStart = (e: DragStartEvent) => {
    const it = list.find((x) => x.id === Number(e.active.id)) ?? null;
    setActive(it); setStartStage(it?.stageId ?? null);
    try { navigator.vibrate?.(12); } catch { /* нет вибрации */ }
  };
  const onOver = (e: DragOverEvent) => {
    if (!e.over) return;
    const to = colOf(e.over.id);
    const id = Number(e.active.id);
    if (to == null) return;
    setList((l) => l.map((x) => (x.id === id && x.stageId !== to ? { ...x, stageId: to } : x)));
  };
  const onEnd = async (e: DragEndEvent) => {
    const it = active;
    setActive(null);
    if (!it || !e.over) { setList(items); return; }
    const overId = String(e.over.id);
    const to = colOf(e.over.id) ?? it.stageId;
    const col = (byCol.get(to) ?? []).filter((x) => x.id !== it.id);
    let idx = overId.startsWith("chip-") ? -1 : col.findIndex((x) => x.id === Number(e.over!.id));
    if (idx < 0) idx = col.length;
    else {
      // в своей колонке при движении вниз вставляем после цели
      const oldIdx = (byCol.get(to) ?? []).findIndex((x) => x.id === it.id);
      if (startStage === to && oldIdx >= 0 && oldIdx <= idx) idx += 1;
    }
    const prev = col[idx - 1]?.sort, next = col[idx]?.sort;
    const sort = prev == null && next == null ? 0 : prev == null ? next! - 1 : next == null ? prev + 1 : (prev + next) / 2;
    if (to === startStage && Math.abs(sort - it.sort) < 1e-9) return;
    const snapshot = list;
    setList((l) => l.map((x) => (x.id === it.id ? { ...x, stageId: to, sort } : x)));
    if (overId.startsWith("chip-")) { const name = columns.find((c) => c.id === to)?.name; if (name) toast.success(`Перемещено: ${name}`); }
    const r = await onMove(it.id, to, sort, it);
    const ok = typeof r === "boolean" ? r : r.ok;
    if (!ok) { setList(snapshot.map((x) => (x.id === it.id ? it : x))); toast.error((typeof r === "object" && r.error) || "Не удалось переместить"); }
  };

  const dragging = !!active;
  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd}
      onDragCancel={() => { setActive(null); setList(items); }}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ threshold: { x: 0.15, y: 0.12 }, acceleration: 14, interval: 5 }}>
      {/* Чипы этапов: на телефоне всегда сверху; во время перетаскивания — цели для броска */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mb-2 bg-bg/90 px-4 py-2 backdrop-blur-md sm:hidden">
        <div ref={chips} className="no-scrollbar relative flex gap-1.5 overflow-x-auto">
          {columns.map((c) => <Chip key={c.id} col={c} count={byCol.get(c.id)?.length ?? 0} current={visible === c.id} dragging={dragging} onClick={() => { setVisible(c.id); scrollToCol(c.id); }} />)}
        </div>
        {dragging && <p className="mt-1.5 text-center text-[11px] text-ink-3">Бросьте на этап сверху или ведите к краю экрана</p>}
      </div>
      <div ref={scroller} onScroll={onScroll} onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp} onPointerCancel={onPanUp}
        className={cn("scroll-thin -mx-4 flex gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-4 sm:mx-0 sm:scroll-px-0 sm:px-0",
          dragging ? "snap-none" : "snap-x snap-mandatory lg:snap-none")}>
        {columns.map((c) => <Column key={c.id} col={c} items={byCol.get(c.id) ?? []} render={render} extra={colExtra?.(c, byCol.get(c.id) ?? [])} canDrag={canDrag} />)}
      </div>
      <DragOverlay dropAnimation={{ duration: 180 }}>{active ? <div className="w-[min(calc(100vw-3rem),420px)] rotate-2 scale-[1.03] cursor-grabbing rounded-xl shadow-2xl ring-2 ring-yellow/70 sm:w-72">{render(active, true)}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function Chip({ col, count, current, dragging, onClick }: { col: KCol; count: number; current: boolean; dragging: boolean; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `chip-${col.id}` });
  return (
    <button ref={setNodeRef} type="button" data-chip={col.id} onClick={onClick}
      className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150",
        current ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2",
        dragging && "border-dashed py-2.5", isOver && "scale-110 border-solid border-yellow bg-yellow text-ink")}>
      <span className="size-2 rounded-full" style={{ background: col.color }} />
      <span className="max-w-32 truncate">{col.name}</span>
      <span className="tnum opacity-70">{count}</span>
    </button>
  );
}

function Column<T extends KItem>({ col, items, render, extra, canDrag }: { col: KCol; items: T[]; render: (i: T) => ReactNode; extra?: ReactNode; canDrag: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.id}` });
  return (
    <section data-col={col.id} className="flex w-[calc(100vw-3rem)] max-w-[420px] shrink-0 snap-start flex-col rounded-2xl bg-surface-2/70 sm:w-72">
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="size-2.5 rounded-full" style={{ background: col.color }} />
        <h2 className="flex-1 truncate text-sm font-bold">{col.name}</h2>
        <span className="tnum rounded-full bg-surface px-2 text-xs font-semibold text-ink-3">{items.length}</span>
      </header>
      {extra}
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex min-h-40 flex-1 flex-col gap-2 rounded-xl p-2 transition-colors duration-150", isOver && "bg-yellow/10 ring-2 ring-inset ring-yellow/40")}>
          {items.map((i) => <Card key={i.id} id={i.id} disabled={!canDrag}>{render(i)}</Card>)}
          {!items.length && <p className="py-10 text-center text-xs text-ink-3">Перетащите сюда</p>}
        </div>
      </SortableContext>
      {col.footer}
    </section>
  );
}

function Card({ id, children, disabled }: { id: number; children: ReactNode; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} data-kcard style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners}
      className={cn("relative touch-manipulation select-none rounded-xl outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-yellow",
        !disabled && "pointer-coarse:[&>:first-child]:pr-11", isDragging && "opacity-30")}>
      {children}
      {!disabled && (
        <span data-drag-handle aria-hidden className="absolute inset-y-0 right-0 hidden w-10 touch-none items-center justify-center rounded-r-xl text-ink-3 active:bg-surface-2 pointer-coarse:flex">
          <GripVertical className="size-5" />
        </span>
      )}
    </div>
  );
}
