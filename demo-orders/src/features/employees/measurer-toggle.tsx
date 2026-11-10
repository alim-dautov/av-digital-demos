"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function MeasurerToggle({
  employeeId,
  initial,
  canWrite,
}: {
  employeeId: string;
  initial: boolean;
  canWrite: boolean;
}) {
  const [checked, setChecked] = useState(initial);
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    setPending(true);
    setChecked(next);
    try {
      const res = await fetch(`/api/employees/${employeeId}/measurer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMeasurer: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      toast.success(next ? "Сотрудник отмечен как замерщик" : "Отметка замерщика снята");
    } catch (e) {
      setChecked(!next);
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`measurer-${employeeId}`}
        checked={checked}
        disabled={!canWrite || pending}
        onCheckedChange={(v) => void toggle(v)}
      />
      <Label htmlFor={`measurer-${employeeId}`} className="font-normal">
        Замерщик — отображается в календаре замеров
      </Label>
    </div>
  );
}
