"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  defaultDropAnimationSideEffects,
  type Active,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardCoordinateGetter,
  type Over,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDateRu, formatKzt, todayDate } from "@/lib/utils";
import type { BoardCard } from "@/lib/services/production";
import { PRODUCTION_BOARD_COLUMNS } from "@/lib/production-board";
import { SPRING, SPRING_EASING_CSS, SPRING_SNAPPY } from "@/lib/motion";

const LIFT_SCALE = 1.03;
const MAX_TILT_DEG = 4;
const TILT_VELOCITY = 1.5;
const TILT_IDLE_MS = 80;
const COLUMN_STEP = 296;
const ROW_STEP = 96;

const moveByColumn: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  switch (event.code) {
    case KeyboardCode.Right:
      return { ...currentCoordinates, x: currentCoordinates.x + COLUMN_STEP };
    case KeyboardCode.Left:
      return { ...currentCoordinates, x: currentCoordinates.x - COLUMN_STEP };
    case KeyboardCode.Down:
      return { ...currentCoordinates, y: currentCoordinates.y + ROW_STEP };
    case KeyboardCode.Up:
      return { ...currentCoordinates, y: currentCoordinates.y - ROW_STEP };
    default:
      return undefined;
  }
};

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "Чтобы взять карточку, нажмите пробел или Enter. Стрелки влево и вправо переносят её между этапами. Пробел или Enter опускают карточку, Escape отменяет перемещение.",
};

type Props = {
  initialCards: BoardCard[];
  canWrite: boolean;
};

function deadlineFlag(deadline: string): { label: string; className: string } | null {
  const today = new Date(todayDate() + "T12:00:00");
  const due = new Date(deadline.slice(0, 10) + "T12:00:00");
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: "Просрочен", className: "text-destructive" };
  if (diff === 0) return { label: "Сегодня", className: "text-warning" };
  if (diff === 1) return { label: "Завтра", className: "text-warning" };
  return null;
}

function CardBody({
  card,
  grip,
  interactive = true,
}: {
  card: BoardCard;
  grip?: React.ReactNode;
  interactive?: boolean;
}) {
  const inProgress = card.stageStatus === "in_progress";
  const showStage = card.stageLabel !== columnLabel(card.columnKey);
  const flag = deadlineFlag(card.deadline);

  return (
    <article className="relative rounded-lg border border-border bg-panel p-3">
      <div className="flex items-start gap-2">
        {grip}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold tabular-nums">
              {interactive ? (
                <Link
                  href={`/orders/${card.orderNumber}`}
                  className="rounded-xs after:absolute after:inset-0 after:rounded-lg hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  №{card.orderNumber}
                </Link>
              ) : (
                <>№{card.orderNumber}</>
              )}
            </h3>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatKzt(card.amount)}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{card.clientName}</p>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-foreground">{card.description}</p>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              inProgress ? "bg-primary" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          <span className="truncate">
            {showStage && `${card.stageLabel}, `}
            {inProgress ? "в работе" : "ожидает"}
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {flag && <span className={cn("mr-1.5 font-medium", flag.className)}>{flag.label}</span>}
          до {formatDateRu(card.deadline)}
        </span>
      </div>
    </article>
  );
}

function KanbanCard({
  card,
  disabled,
}: {
  card: BoardCard;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: card.orderId,
    data: { type: "card", card, columnKey: card.columnKey },
    disabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `card:${card.orderId}`,
    data: { type: "card", columnKey: card.columnKey },
    disabled,
  });

  function setNodeRef(node: HTMLElement | null) {
    setDragRef(node);
    setDropRef(node);
  }

  return (
    <motion.div
      ref={setNodeRef}
      layout={reduceMotion || isDragging ? false : "position"}
      transition={SPRING}
      className={cn(
        "relative rounded-lg",
        isDragging && "opacity-40",
        isOver && !isDragging && "ring-2 ring-primary/40",
      )}
    >
      <CardBody
        card={card}
        grip={
          !disabled ? (
            <button
              type="button"
              className="relative z-10 -m-1 cursor-grab touch-none rounded-sm p-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              aria-label={`Перетащить заказ №${card.orderNumber}`}
              {...listeners}
              {...attributes}
            >
              <GripVertical className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          ) : undefined
        }
      />
    </motion.div>
  );
}

function LiftedCard({
  card,
  tilt,
}: {
  card: BoardCard;
  tilt: MotionValue<number>;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="cursor-grabbing rounded-lg shadow-lg"
      initial={{ scale: 1 }}
      animate={{ scale: reduceMotion ? 1 : LIFT_SCALE }}
      transition={SPRING_SNAPPY}
      style={reduceMotion ? undefined : { rotate: tilt }}
    >
      <CardBody
        card={card}
        interactive={false}
        grip={
          <span className="-m-1 p-1.5 text-muted-foreground">
            <GripVertical className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
        }
      />
    </motion.div>
  );
}

function columnLabel(key: string | null): string {
  return PRODUCTION_BOARD_COLUMNS.find((c) => c.key === key)?.label ?? "";
}

function KanbanColumn({
  columnKey,
  label,
  cards,
  canWrite,
  isOver,
}: {
  columnKey: string;
  label: string;
  cards: BoardCard[];
  canWrite: boolean;
  isOver?: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: columnKey,
    data: { type: "column", columnKey },
  });

  return (
    <section aria-label={`${label}: ${cards.length}`} className="flex w-[280px] shrink-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="truncate text-sm font-semibold">{label}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-40 flex-1 space-y-2 rounded-lg bg-foreground/[0.03] p-1.5 ring-1 ring-transparent transition-[background-color,box-shadow] duration-150",
          isOver && "bg-primary/[0.06] ring-primary/40",
        )}
      >
        {cards.map((card) => (
          <KanbanCard key={card.orderId} card={card} disabled={!canWrite} />
        ))}
        {cards.length === 0 && (
          <div className="flex min-h-37 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
            {canWrite ? "Перетащите заказ сюда" : "Нет заказов"}
          </div>
        )}
      </div>
    </section>
  );
}

function resolveColumnKey(
  overId: string,
  cards: BoardCard[],
  overData?: { type?: string; columnKey?: string },
): string | null {
  if (overData?.columnKey) return overData.columnKey;
  if (PRODUCTION_BOARD_COLUMNS.some((c) => c.key === overId)) return overId;
  if (overId.startsWith("card:")) {
    const orderId = overId.slice(5);
    return cards.find((c) => c.orderId === orderId)?.columnKey ?? null;
  }
  return cards.find((c) => c.orderId === overId)?.columnKey ?? null;
}

export function ProductionKanban({ initialCards, canWrite }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumnKey, setOverColumnKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reduceMotion = useReducedMotion();

  const velocityX = useMotionValue(0);
  const smoothVelocityX = useSpring(velocityX, { stiffness: 300, damping: 30 });
  const tilt = useTransform(
    smoothVelocityX,
    [-TILT_VELOCITY, TILT_VELOCITY],
    [-MAX_TILT_DEG, MAX_TILT_DEG],
    { clamp: true },
  );
  const lastMoveRef = useRef<{ x: number; t: number } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: moveByColumn }),
  );

  const dropAnimation = useMemo<DropAnimation>(
    () =>
      reduceMotion
        ? {
            duration: 150,
            easing: "ease-out",
            keyframes: () => [{ opacity: 1 }, { opacity: 0 }],
            sideEffects: defaultDropAnimationSideEffects({
              styles: { active: { opacity: "0.4" } },
            }),
          }
        : {
            duration: 260,
            easing: SPRING_EASING_CSS,
            keyframes: ({ transform: { initial, final } }) => [
              { transform: CSS.Transform.toString(initial) },
              {
                transform: CSS.Transform.toString({
                  ...final,
                  scaleX: final.scaleX / LIFT_SCALE,
                  scaleY: final.scaleY / LIFT_SCALE,
                }),
              },
            ],
            sideEffects: defaultDropAnimationSideEffects({
              styles: { active: { opacity: "0.4" } },
            }),
          },
    [reduceMotion],
  );

  const activeCard = useMemo(
    () => cards.find((c) => c.orderId === activeId) ?? null,
    [cards, activeId],
  );

  const byColumn = useMemo(() => {
    const map: Record<string, BoardCard[]> = {};
    for (const col of PRODUCTION_BOARD_COLUMNS) map[col.key] = [];
    for (const card of cards) {
      if (!map[card.columnKey]) map[card.columnKey] = [];
      map[card.columnKey].push(card);
    }
    return map;
  }, [cards]);

  function resetTilt() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    lastMoveRef.current = null;
    velocityX.set(0);
  }

  function orderLabel(active: Active): string {
    const card = (active.data.current as { card?: BoardCard } | undefined)?.card;
    return card ? `Заказ №${card.orderNumber}` : "Заказ";
  }

  function overLabel(over: Over | null): string | null {
    if (!over) return null;
    const data = over.data.current as
      | { type?: string; columnKey?: string }
      | undefined;
    return columnLabel(resolveColumnKey(String(over.id), cards, data)) || null;
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `${orderLabel(active)} взят для перемещения.`,
    onDragOver: ({ active, over }) => {
      const label = overLabel(over);
      return label
        ? `${orderLabel(active)} над этапом «${label}».`
        : `${orderLabel(active)} вне этапов.`;
    },
    onDragEnd: ({ active, over }) => {
      const label = overLabel(over);
      return label
        ? `${orderLabel(active)} опущен на этап «${label}».`
        : `${orderLabel(active)} опущен, этап не изменён.`;
    },
    onDragCancel: ({ active }) =>
      `Перемещение отменено. ${orderLabel(active)} остался на месте.`,
  };

  function onDragStart(event: DragStartEvent) {
    resetTilt();
    setActiveId(String(event.active.id));
  }

  function onDragMove(event: DragMoveEvent) {
    if (reduceMotion) return;
    const now = performance.now();
    const x = event.delta.x;
    const last = lastMoveRef.current;
    if (last && now > last.t) {
      velocityX.set((x - last.x) / (now - last.t));
    }
    lastMoveRef.current = { x, t: now };
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => velocityX.set(0), TILT_IDLE_MS);
  }

  function onDragOver(event: DragOverEvent) {
    if (!event.over) {
      setOverColumnKey(null);
      return;
    }
    const data = event.over.data.current as
      | { type?: string; columnKey?: string }
      | undefined;
    setOverColumnKey(resolveColumnKey(String(event.over.id), cards, data));
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    resetTilt();
    setActiveId(null);
    setOverColumnKey(null);
    if (!over || !canWrite || pending) return;

    const orderId = String(active.id);
    const overData = over.data.current as
      | { type?: string; columnKey?: string }
      | undefined;
    const targetColumn = resolveColumnKey(String(over.id), cards, overData);
    if (!targetColumn) return;

    const card = cards.find((c) => c.orderId === orderId);
    if (!card || card.columnKey === targetColumn) return;

    const prev = cards;
    const col = PRODUCTION_BOARD_COLUMNS.find((c) => c.key === targetColumn)!;

    setCards((list) =>
      list.map((c) =>
        c.orderId === orderId
          ? {
              ...c,
              columnKey: targetColumn,
              stageKey: col.stageKeys[0],
              stageLabel: col.label,
              stageStatus: "in_progress",
            }
          : c,
      ),
    );
    setPending(true);

    try {
      const res = await fetch("/api/production/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, columnKey: targetColumn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось переместить");

      setCards((list) =>
        list.map((c) =>
          c.orderId === orderId
            ? {
                ...c,
                columnKey: targetColumn,
                stageId: data.stage.id,
                stageKey: data.stage.key,
                stageLabel: data.stage.label,
                stageStatus: data.stage.status,
              }
            : c,
        ),
      );
      toast.success(`Заказ №${card.orderNumber} перенесён на этап «${col.label}»`);
    } catch (e) {
      setCards(prev);
      toast.error(e instanceof Error ? e.message : "Ошибка перемещения");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <p className="text-xs text-muted-foreground">
          Перетащите карточку за ручку на другой этап. Изменения сохраняются сразу.
        </p>
      )}
      <DndContext
        id="production-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{
          announcements,
          screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
        }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={(e) => void onDragEnd(e)}
        onDragCancel={() => {
          resetTilt();
          setActiveId(null);
          setOverColumnKey(null);
        }}
      >
        <div className="-mx-4 flex gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:-mx-6 sm:px-6">
          {PRODUCTION_BOARD_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              columnKey={col.key}
              label={col.label}
              cards={byColumn[col.key] ?? []}
              canWrite={canWrite}
              isOver={overColumnKey === col.key}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeCard ? <LiftedCard card={activeCard} tilt={tilt} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
