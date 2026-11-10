import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Lock,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  SkeletonRows,
  Textarea,
  Toast,
} from "../ui";
import { api } from "../../lib/api";
import { errorText } from "../../lib/insights";

export type PayrollTask = {
  id: number;
  title: string;
  day: string;
  due_at: string | null;
  handed_at: string | null;
  status: string;
  counted: boolean;
  reason: string | null;
};
export type PayrollIndicator = {
  key: string;
  title: string;
  max_amount: number;
  planned: number;
  done: number;
  percent: number | null;
  bonus: number;
  tasks: PayrollTask[];
};
export type PayrollEmployee = {
  user_id: number;
  name: string;
  dept_name: string | null;
  salary: number;
  indicators: PayrollIndicator[];
  bonus_calculated: number;
  adjustment: number;
  adjustment_comment?: string | null;
  bonus_total: number;
  total_pay: number;
};
export type PayrollReport = {
  period: string;
  status: "open" | "approved";
  approved_at: string | null;
  approved_by_name: string | null;
  cap: number;
  employees: PayrollEmployee[];
  totals: { salary: number; bonus: number; pay: number } | null;
  can_manage: boolean;
};

const money = (v: number) => `${v.toLocaleString("ru-RU")} ₸`;
const pct = (v: number | null) =>
  v === null ? "—" : `${v.toLocaleString("ru-RU")}%`;
const time = (v: string | null) =>
  v
    ? v
        .slice(5, 16)
        .replace("-", ".")
        .replace(/^(\d\d)\.(\d\d)/, "$2.$1")
    : "—";

function tone(p: number | null): string {
  if (p === null) return "var(--color-muted)";
  if (p >= 95) return "var(--color-success)";
  if (p >= 70) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function KpiPayroll({ period }: { period: string }) {
  const [data, setData] = useState<PayrollReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [salaryFor, setSalaryFor] = useState<PayrollEmployee | null>(null);
  const [adjustFor, setAdjustFor] = useState<PayrollEmployee | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<PayrollReport>(`/kpi/payroll?period=${period}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [period]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const act = async (
    fn: () => Promise<PayrollReport | unknown>,
    ok: string,
  ) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && typeof res === "object" && "employees" in res)
        setData(res as PayrollReport);
      else await load();
      flash(ok);
      return true;
    } catch (e) {
      flash(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <SkeletonRows />;

  const approved = data.status === "approved";
  const manage = data.can_manage;
  const editable = manage && !approved;

  return (
    <div className="page-enter space-y-3">
      {manage ? (
        <div className="flex flex-wrap items-center gap-2">
          {approved ? (
            <Badge tone="success">
              <Lock size={12} className="mr-1 inline" /> Утверждён
              {data.approved_at ? ` ${time(data.approved_at)}` : ""}
              {data.approved_by_name ? ` · ${data.approved_by_name}` : ""}
            </Badge>
          ) : (
            <Badge tone="warning">Черновик — идёт расчёт</Badge>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-border bg-panel px-4 text-sm font-medium hover:bg-panel-2"
              href={`/api/kpi/payroll/${data.period}/export`}
              download
            >
              <Download size={16} /> Excel
            </a>
            {approved ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt(
                    "Причина открытия месяца (попадёт в журнал):",
                    "",
                  );
                  if (reason === null) return;
                  void act(
                    () =>
                      api(`/kpi/payroll/${data.period}/reopen`, {
                        method: "POST",
                        body: JSON.stringify({ reason }),
                      }),
                    "Месяц открыт для правок",
                  );
                }}
              >
                <RotateCcw size={16} /> Открыть заново
              </Button>
            ) : (
              <Button
                disabled={busy || data.employees.length === 0}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Утвердить месяц? Суммы будут зафиксированы и станут только для чтения.",
                    )
                  )
                    return;
                  void act(
                    () =>
                      api(`/kpi/payroll/${data.period}/approve`, {
                        method: "POST",
                      }),
                    "Месяц утверждён",
                  );
                }}
              >
                <CheckCircle2 size={16} /> Утвердить месяц
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Ваш прогресс за месяц (только просмотр).
        </p>
      )}

      {data.employees.length === 0 ? (
        <EmptyState
          title="Нет данных за месяц"
          description={
            manage
              ? "Укажите оклады и назначьте регулярные задачи с KPI-показателем."
              : "За этот месяц нет KPI-задач."
          }
        />
      ) : null}

      {data.employees.map((e) => (
        <Card key={e.user_id} className="overflow-hidden">
          <div className="flex flex-wrap items-start gap-3 border-b border-border p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{e.name}</div>
              <div className="truncate text-xs text-muted">
                {e.dept_name || "без отдела"}
              </div>
            </div>
            <div className="text-right">
              <div className="tabular text-lg font-semibold">
                {money(e.total_pay)}
              </div>
              <div className="text-xs text-muted">
                оклад {money(e.salary)} + бонус {money(e.bonus_total)}
              </div>
            </div>
          </div>
          {e.indicators.map((i) => {
            const k = `${e.user_id}:${i.key}`;
            return (
              <div key={i.key} className="border-b border-border last:border-0">
                <button
                  type="button"
                  className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3 py-2 text-left text-sm hover:bg-panel-2 disabled:cursor-default"
                  disabled={i.planned === 0}
                  onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}
                >
                  {i.planned === 0 ? (
                    <span />
                  ) : open[k] ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{i.title}</span>
                    <span className="text-xs text-muted">
                      {i.planned === 0
                        ? "нет задач в месяце"
                        : `${i.done} из ${i.planned} вовремя`}{" "}
                      · макс. {money(i.max_amount)}
                    </span>
                  </span>
                  <span
                    className="tabular w-14 text-right font-medium"
                    style={{ color: tone(i.percent) }}
                  >
                    {pct(i.percent)}
                  </span>
                  <span className="tabular w-24 text-right">
                    {i.planned === 0 ? "—" : money(i.bonus)}
                  </span>
                </button>
                {open[k] ? (
                  <ul className="bg-bg px-3 py-2 text-xs">
                    {i.tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 py-1">
                        <span
                          className={t.counted ? "text-success" : "text-danger"}
                        >
                          {t.counted ? "✓" : "✗"}
                        </span>
                        <span className="tabular w-11 text-muted">
                          {t.day.slice(8, 10)}.{t.day.slice(5, 7)}
                        </span>
                        <Link
                          to={`/tasks?task=${t.id}`}
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {t.title}
                        </Link>
                        <span className="text-muted">
                          {t.reason ?? `сдана ${time(t.handed_at)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2 bg-panel-2/40 px-3 py-2 text-xs text-muted">
            <span>Расчётный бонус {money(e.bonus_calculated)}</span>
            {e.adjustment !== 0 ? (
              <span
                className={e.adjustment > 0 ? "text-success" : "text-danger"}
              >
                корректировка {e.adjustment > 0 ? "+" : ""}
                {money(e.adjustment)}
                {e.adjustment_comment ? ` — ${e.adjustment_comment}` : ""}
              </span>
            ) : null}
            {editable ? (
              <span className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  className="min-h-8 px-2 text-xs"
                  onClick={() => setSalaryFor(e)}
                >
                  <Pencil size={14} /> Оклад
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-8 px-2 text-xs"
                  onClick={() => setAdjustFor(e)}
                >
                  ± Корректировка
                </Button>
              </span>
            ) : null}
          </div>
        </Card>
      ))}

      {manage && data.totals && data.employees.length > 0 ? (
        <Card className="flex flex-wrap gap-4 p-3 text-sm">
          <span>
            Оклады: <b className="tabular">{money(data.totals.salary)}</b>
          </span>
          <span>
            Бонусы: <b className="tabular">{money(data.totals.bonus)}</b>
          </span>
          <span className="ml-auto">
            К выплате: <b className="tabular">{money(data.totals.pay)}</b>
          </span>
        </Card>
      ) : null}
      {manage ? (
        <p className="text-xs text-muted">
          Бонус = максимум × задачи, сданные вовремя и с подтверждением / задачи
          по плану. Отпуск и праздники не входят в план. Бонус не больше{" "}
          {money(data.cap)}, оклад KPI не уменьшает.
        </p>
      ) : null}

      <SalarySheet
        employee={salaryFor}
        busy={busy}
        onClose={() => setSalaryFor(null)}
        onSave={async (salary) => {
          if (!salaryFor) return;
          if (
            await act(
              () =>
                api("/kpi/salaries", {
                  method: "PUT",
                  body: JSON.stringify({ user_id: salaryFor.user_id, salary }),
                }),
              "Оклад сохранён",
            )
          )
            setSalaryFor(null);
        }}
      />
      <AdjustSheet
        employee={adjustFor}
        busy={busy}
        onClose={() => setAdjustFor(null)}
        onSave={async (amount, comment) => {
          if (!adjustFor) return;
          if (
            await act(
              () =>
                api(`/kpi/payroll/${data.period}/adjustments`, {
                  method: "PUT",
                  body: JSON.stringify({
                    user_id: adjustFor.user_id,
                    amount,
                    comment,
                  }),
                }),
              "Корректировка сохранена",
            )
          )
            setAdjustFor(null);
        }}
      />
      <Toast message={toast} />
    </div>
  );
}

function SalarySheet({
  employee,
  busy,
  onClose,
  onSave,
}: {
  employee: PayrollEmployee | null;
  busy: boolean;
  onClose: () => void;
  onSave: (v: number) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(
    () => setValue(employee ? String(employee.salary || "") : ""),
    [employee],
  );
  return (
    <BottomSheet
      open={employee !== null}
      title={`Оклад — ${employee?.name ?? ""}`}
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          onSave(Number(value || 0));
        }}
      >
        <Field label="Оклад в месяц, ₸">
          <Input
            inputMode="numeric"
            value={value}
            onChange={(ev) => setValue(ev.target.value.replace(/[^\d]/g, ""))}
            placeholder="300000"
          />
        </Field>
        <p className="text-xs text-muted">
          Оклад не уменьшается из-за KPI. Изменение попадёт в журнал.
        </p>
        <Button type="submit" disabled={busy} className="w-full">
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  );
}

function AdjustSheet({
  employee,
  busy,
  onClose,
  onSave,
}: {
  employee: PayrollEmployee | null;
  busy: boolean;
  onClose: () => void;
  onSave: (amount: number, comment: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  useEffect(() => {
    setAmount(employee?.adjustment ? String(employee.adjustment) : "");
    setComment(employee?.adjustment_comment ?? "");
  }, [employee]);
  const n = Number(amount || 0);
  return (
    <BottomSheet
      open={employee !== null}
      title={`Корректировка бонуса — ${employee?.name ?? ""}`}
      onClose={onClose}
      persistent
    >
      <form
        className="space-y-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          onSave(n, comment.trim());
        }}
      >
        <Field label="Сумма, ₸ (минус — уменьшить, 0 — убрать)">
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(ev) => setAmount(ev.target.value.replace(/[^\d-]/g, ""))}
            placeholder="5000 или -3000"
          />
        </Field>
        <Field label="Комментарий (обязательно)">
          <Textarea
            value={comment}
            onChange={(ev) => setComment(ev.target.value)}
            rows={3}
            placeholder="За что корректировка"
          />
        </Field>
        <Button
          type="submit"
          disabled={
            busy || Number.isNaN(n) || (n !== 0 && comment.trim() === "")
          }
          className="w-full"
        >
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  );
}
