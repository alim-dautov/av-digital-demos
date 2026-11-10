"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type SectionOrderContextValue = { order: string[] };
const SectionOrderContext = createContext<SectionOrderContextValue | null>(null);

function readOrder(storageKey: string, ids: string[]) {
  if (typeof window === "undefined") return ids;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(saved)) return ids;
    const retained = saved.filter((id): id is string => typeof id === "string" && ids.includes(id));
    return [...retained, ...ids.filter((id) => !retained.includes(id))];
  } catch {
    return ids;
  }
}

/**
 * Shared sortable canvas for calculator sections. New calculators only need to provide
 * stable section ids and wrap each movable block in CalculatorSortableSection.
 */
export function CalculatorSectionLayout({
  storageKey,
  ids,
  children,
  className,
}: {
  storageKey: string;
  ids: readonly string[];
  children: React.ReactNode;
  className?: string;
}) {
  const stableIds = useMemo(() => [...ids], [ids]);
  const [order, setOrder] = useState(() => readOrder(storageKey, stableIds));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((current) => {
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));
      if (from < 0 || to < 0) return current;
      const next = arrayMove(current, from, to);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* Reordering still works when browser storage is unavailable. */
      }
      return next;
    });
  }

  return (
    <SectionOrderContext.Provider value={{ order }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className={cn("flex flex-col gap-6", className)}>{children}</div>
        </SortableContext>
      </DndContext>
    </SectionOrderContext.Provider>
  );
}

export function CalculatorSortableSection({
  id,
  children,
  className,
  handleLabel = "Переместить блок",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  handleLabel?: string;
}) {
  const context = useContext(SectionOrderContext);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const order = context?.order ?? [];
  const position = order.indexOf(id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, order: position >= 0 ? position : undefined }}
      className={cn("relative min-w-0", isDragging && "z-20 opacity-70", className)}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={handleLabel}
        title={handleLabel}
        className="absolute right-3 top-3 z-10 grid size-9 touch-none place-items-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 sm:right-4"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      {children}
    </div>
  );
}
