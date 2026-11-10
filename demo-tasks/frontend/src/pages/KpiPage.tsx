import { Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { KpiPayroll } from "../components/kpi/KpiPayroll";
import {
  Card,
  EmptyState,
  ErrorState,
  Input,
  SkeletonRows,
} from "../components/ui";
import { api } from "../lib/api";
import { currentPeriod, errorText } from "../lib/insights";

export type KpiRow = {
  user_id: number;
  name: string;
  initials: string;
  dept_name: string | null;
  plan: number | null;
  fact: number | null;
  percent: number | null;
};
export type KpiData = {
  period: string;
  items: KpiRow[];
  can_edit: boolean;
  note: string;
};

const num = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("ru-RU");

function tone(p: number | null): string {
  if (p === null) return "var(--color-muted)";
  if (p >= 100) return "var(--color-success)";
  if (p >= 70) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function KpiPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [tab, setTab] = useState<"pay" | "plan">("pay");
  const [data, setData] = useState<KpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<KpiData>(`/kpi?period=${period}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [period]);

  useEffect(() => {
    if (tab === "plan") void load();
  }, [load, tab]);

  return (
    <AppShell
      title="KPI"
      subtitle="Оклад, бонус и выполнение по сотрудникам"
      showFilters={false}
    >
      <div className="page-enter mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          Месяц
          <Input
            type="month"
            value={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)}
            className="w-44"
          />
        </label>
        <div
          className="flex rounded-[9px] border border-border p-0.5 text-sm"
          role="tablist"
        >
          {(
            [
              ["pay", "Зарплата и бонус"],
              ["plan", "План / факт"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`min-h-9 rounded-[7px] px-3 ${tab === k ? "bg-accent text-white" : "text-muted hover:text-text"}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "pay" ? <KpiPayroll period={period} /> : null}
      {tab === "plan" ? (
        <>
          {!data && !error ? <SkeletonRows /> : null}
          {error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : null}
          {data && data.items.length === 0 ? (
            <EmptyState
              title="Нет сотрудников"
              description="Добавьте сотрудников в Настройках."
            />
          ) : null}
          {data && data.items.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 border-b border-border p-3 text-xs text-muted sm:grid-cols-[minmax(0,1fr)_120px_120px_200px]">
                <span>Сотрудник</span>
                <span className="text-right">План</span>
                <span className="text-right">Факт</span>
                <span className="text-right sm:text-left">%</span>
              </div>
              {data.items.map((row) => (
                <div
                  key={row.user_id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 border-b border-border p-3 text-sm last:border-0 sm:grid-cols-[minmax(0,1fr)_120px_120px_200px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.name}</div>
                    <div className="truncate text-xs text-muted">
                      {row.dept_name || "без отдела"}
                    </div>
                  </div>
                  <span className="tabular text-right">{num(row.plan)}</span>
                  <span className="tabular text-right">{num(row.fact)}</span>
                  <div className="flex items-center justify-end gap-2 sm:justify-start">
                    <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-bg sm:block">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, row.percent ?? 0)}%`,
                          background: tone(row.percent),
                        }}
                      />
                    </div>
                    <span
                      className="tabular w-14 text-right font-medium"
                      style={{ color: tone(row.percent) }}
                    >
                      {row.percent === null
                        ? "—"
                        : `${row.percent.toLocaleString("ru-RU")}%`}
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          ) : null}
          {data?.can_edit ? (
            <p className="mt-3 text-xs text-muted">
              <Info size={12} className="mr-1 inline" />
              План и факт заполняются в «Настройках» → «KPI сотрудников».
            </p>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
