"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatKzt } from "@/lib/utils";
import { roomHasContent } from "@/lib/domain/atelier-calc";
import type { AtelierRoom } from "@/types";

export function RoomsBar({
  rooms,
  activeId,
  canWrite,
  onSelect,
  onAdd,
  onRename,
  onRemove,
}: {
  rooms: AtelierRoom[];
  activeId: string;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const active = rooms.find((r) => r.id === activeId) ?? rooms[0];

  function remove(room: AtelierRoom) {
    if (rooms.length <= 1) return;
    if (
      roomHasContent(room) &&
      !window.confirm(`Удалить комнату «${room.name || "Без названия"}» со всеми расчётами?`)
    ) {
      return;
    }
    onRemove(room.id);
  }

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Комнаты">
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={r.id === active?.id}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              event.preventDefault();
              onSelect(r.id);
            }}
            onClick={(event) => {
              if (event.detail === 0) onSelect(r.id);
            }}
            className={cn(
              "touch-manipulation min-h-14 shrink-0 rounded-lg border px-4 py-2 text-left text-base transition-none",
              r.id === active?.id
                ? "border-[3px] border-primary bg-primary/15"
                : "border border-neutral-500 active:bg-foreground/10",
            )}
          >
            <span className="block max-w-[11rem] truncate text-sm font-medium">
              {r.name.trim() || "Без названия"}
            </span>
            <span className="block text-xs tabular-nums text-muted-foreground">
              {formatKzt(r.subtotal)}
            </span>
          </button>
        ))}
        {canWrite && (
          <Button type="button" variant="outline" className="min-h-14 w-full shrink-0 self-stretch sm:w-auto" onClick={onAdd}>
            <Plus className="mr-1 size-5" /> Добавить комнату
          </Button>
        )}
      </div>

      {active && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <Label>Название комнаты</Label>
            <Input
              value={active.name}
              disabled={!canWrite}
              onChange={(e) => onRename(active.id, e.target.value)}
            />
          </div>
          {canWrite && rooms.length > 1 && (
            <Button type="button" variant="ghost" className="min-h-14 w-full sm:w-auto" onClick={() => remove(active)}>
              <Trash2 className="mr-1 size-5" /> Удалить комнату
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
