"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type EmployeePayrollRow = {
  id: string;
  fullName: string;
  position: string;
  supervisorId: string | null;
  advanceMaxPercent: number | null;
  percentBased: boolean;
};

/** Настройки → Руководители и лимит аванса. Только OWNER/DIRECTOR. */
export function EmployeePayrollAdmin({
  employees,
  defaultAdvancePercent,
}: {
  employees: EmployeePayrollRow[];
  defaultAdvancePercent: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Руководители и лимит аванса</CardTitle>
        <p className="text-sm text-muted-foreground">
          Руководитель видит зарплаты и авансы своих подчинённых (только просмотр). Максимальный
          аванс — % от заработка по текущим заказам минус уже выданные авансы. Пусто — общий
          лимит {defaultAdvancePercent}%.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {employees.map((e) => (
          <EmployeeRow key={e.id} row={e} all={employees} defaultPercent={defaultAdvancePercent} />
        ))}
      </CardContent>
    </Card>
  );
}

function EmployeeRow({
  row,
  all,
  defaultPercent,
}: {
  row: EmployeePayrollRow;
  all: EmployeePayrollRow[];
  defaultPercent: number;
}) {
  const router = useRouter();
  const [supervisorId, setSupervisorId] = useState(row.supervisorId ?? "");
  const [percent, setPercent] = useState(
    row.advanceMaxPercent == null ? "" : String(row.advanceMaxPercent),
  );
  const [saving, setSaving] = useState(false);
  const dirty =
    supervisorId !== (row.supervisorId ?? "") ||
    percent !== (row.advanceMaxPercent == null ? "" : String(row.advanceMaxPercent));

  async function save() {
    const p = percent.trim() === "" ? null : Number(percent.replace(",", "."));
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 100)) {
      toast.error("Процент аванса — от 0 до 100");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/employees/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorId: supervisorId || null, advanceMaxPercent: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось сохранить");
        return;
      }
      toast.success(`${row.fullName}: сохранено`);
      router.refresh();
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_1fr_10rem_auto] md:items-end">
      <div>
        <p className="text-base font-medium">{row.fullName}</p>
        {row.position && <p className="text-sm text-muted-foreground">{row.position}</p>}
      </div>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Руководитель</span>
        <select
          className="h-12 w-full rounded-md border border-input bg-background px-3 text-base"
          value={supervisorId}
          onChange={(e) => setSupervisorId(e.target.value)}
        >
          <option value="">— нет —</option>
          {all
            .filter((o) => o.id !== row.id)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName}
              </option>
            ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">
          Макс. аванс, %{!row.percentBased && " (оклад — не применяется)"}
        </span>
        <Input
          className="h-12 text-base"
          inputMode="decimal"
          placeholder={String(defaultPercent)}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
        />
      </label>
      <Button
        type="button"
        size="lg"
        className="min-h-12"
        disabled={!dirty || saving}
        onClick={save}
      >
        {saving ? "…" : "Сохранить"}
      </Button>
    </div>
  );
}
