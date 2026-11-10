"use client";

import * as React from "react";
import type { TeamMemberPayroll } from "@/lib/services/payroll-scope";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import {
  AdvanceDialog,
  type AdvanceEmployeeOption,
} from "@/features/payroll/advance-dialog";
import type { OwnPayrollSummary } from "@/lib/services/payroll";
import { SalaryPaymentDialog } from "@/features/payroll/salary-payment-dialog";
import { useSingleFlight } from "@/lib/use-single-flight";
import { formatDateRu, formatKzt, todayDate } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABELS,
  type Advance,
  type ActivityLog,
  type PaymentMethod,
  type Penalty,
  type SalaryPayment,
  type SalaryRecord,
} from "@/types";

const PERIOD_FORMAT = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

function formatPeriod(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return PERIOD_FORMAT.format(new Date(`${period}-15T12:00:00`)).replace(" г.", "");
}

function salaryBreakdown(s: SalaryRecord): string {
  const parts = [`база ${formatKzt(s.baseAmount)}`];
  if (s.bonus > 0) parts.push(`бонус ${formatKzt(s.bonus)}`);
  if (s.penalties > 0) parts.push(`штрафы ${formatKzt(s.penalties)}`);
  if (s.advances > 0) parts.push(`авансы ${formatKzt(s.advances)}`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel">
      <EmptyState compact title={title} />
    </div>
  );
}

export type AssemblerDebtRow = {
  employeeId: string;
  fullName: string;
  earned: number;
  advances: number;
  penalties: number;
  owed: number;
};

type PaymentRow = SalaryPayment & { employeeName: string; authorName: string };
type AdvanceRow = Advance & { employeeName: string; authorName: string };

type PayrollViewProps = {
  salaries: (SalaryRecord & { employeeName: string })[];
  payments: PaymentRow[];
  advances: AdvanceRow[];
  advanceHistory: ActivityLog[];
  penalties: (Penalty & { employeeName: string })[];
  employees: AdvanceEmployeeOption[];
  debt: { totalDebt: number; masters: AssemblerDebtRow[] };
  canWrite: boolean;
  canManage: boolean;
  team?: TeamMemberPayroll[];
  seeOthers: boolean;
  own?: OwnPayrollSummary | null;
};

function TeamPayroll({ team }: { team: TeamMemberPayroll[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Мои подчинённые</CardTitle>
        <p className="text-sm text-muted-foreground">Только просмотр: зарплаты и авансы.</p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {team.map((m) => (
          <div key={m.employeeId} className="space-y-3 rounded-md border border-border p-4">
            <div>
              <p className="text-base font-semibold">{m.fullName}</p>
              {m.position && <p className="text-sm text-muted-foreground">{m.position}</p>}
            </div>
            <TeamList title="Авансы" rows={m.advances} />
            <TeamList title="Выплаты зарплаты" rows={m.salaryPayments} />
            {m.salaries.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Начисления</p>
                <ul className="space-y-1 text-sm">
                  {m.salaries.slice(0, 6).map((s, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{s.period}</span>
                      <span className="tabular-nums">{formatKzt(s.netAmount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TeamList({ title, rows }: { title: string; rows: { date: string; amount: number }[] }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет записей</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.slice(0, 10).map((r, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{formatDateRu(r.date)}</span>
              <span className="tabular-nums">{formatKzt(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnSummary({ own }: { own: OwnPayrollSummary }) {
  const items = [
    { label: "Заработано", value: own.totalEarned },
    { label: "Авансы", value: own.advancesIssued },
    { label: "Штрафы", value: own.penaltiesTotal },
    { label: "Выплачено", value: own.paidOut },
  ];
  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-5 sm:p-5">
        {items.map((i) => (
          <div key={i.label}>
            <p className="text-sm text-muted-foreground">{i.label}</p>
            <p className="text-lg font-semibold tabular-nums">{formatKzt(i.value)}</p>
          </div>
        ))}
        <div>
          <p className="text-sm text-muted-foreground">К выплате</p>
          <p className="text-2xl font-bold tabular-nums">{formatKzt(own.balance)}</p>
        </div>
        {own.advanceLimit && (
          <div className="sm:col-span-5 rounded-md bg-panel-elevated p-3 text-sm">
            Можно взять аванс до{" "}
            <span className="font-semibold tabular-nums">
              {formatKzt(own.advanceLimit.available)}
            </span>{" "}
            ({own.advanceLimit.percent}% от заработка по текущим заказам минус выданные авансы)
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Filter = { employeeId: string; from: string; to: string; method: "all" | PaymentMethod };

const EMPTY_FILTER: Filter = { employeeId: "all", from: "", to: "", method: "all" };

function matches(row: { employeeId: string; date: string }, f: Filter): boolean {
  const day = row.date.slice(0, 10);
  if (f.employeeId !== "all" && row.employeeId !== f.employeeId) return false;
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}

function monthStart(): string {
  return `${todayDate().slice(0, 7)}-01`;
}

function FilterBar({
  filter,
  onChange,
  employees,
  seeOthers,
  withMethod = false,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  employees: { id: string; fullName: string }[];
  seeOthers: boolean;
  withMethod?: boolean;
}) {
  const set = <K extends keyof Filter>(key: K, value: Filter[K]) =>
    onChange({ ...filter, [key]: value });
  const active =
    filter.employeeId !== "all" || filter.from || filter.to || filter.method !== "all";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {seeOthers && (
        <div className="space-y-1.5 sm:w-[220px]">
          <Label className="text-xs text-muted-foreground">Сотрудник</Label>
          <Select value={filter.employeeId} onValueChange={(v) => set("employeeId", v)}>
            <SelectTrigger aria-label="Фильтр по сотруднику">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сотрудники</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">С</Label>
          <Input
            type="date"
            value={filter.from}
            onChange={(e) => set("from", e.target.value)}
            aria-label="Дата с"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">По</Label>
          <Input
            type="date"
            value={filter.to}
            onChange={(e) => set("to", e.target.value)}
            aria-label="Дата по"
          />
        </div>
      </div>
      {withMethod && (
        <div className="space-y-1.5 sm:w-[180px]">
          <Label className="text-xs text-muted-foreground">Способ</Label>
          <Select
            value={filter.method}
            onValueChange={(v) => set("method", v as Filter["method"])}
          >
            <SelectTrigger aria-label="Фильтр по способу выдачи">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Любой</SelectItem>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange({ ...filter, from: monthStart(), to: "" })}
        >
          Этот месяц
        </Button>
        {active && (
          <Button type="button" variant="ghost" onClick={() => onChange(EMPTY_FILTER)}>
            Сбросить
          </Button>
        )}
      </div>
    </div>
  );
}

function TotalCard({ label, total, count }: { label: string; total: number; count: number }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
        {formatKzt(total)}
      </p>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">Записей: {count}</p>
    </div>
  );
}

function RowActions({
  onEdit,
  onDelete,
  label,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  label: string;
}) {
  if (!onEdit && !onDelete) return null;
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Изменить ${label}`}>
          <Pencil className="size-4" />
        </Button>
      )}
      {onDelete && (
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Удалить ${label}`}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

type DeleteTarget =
  | { kind: "payment"; row: PaymentRow }
  | { kind: "advance"; row: AdvanceRow };

export function PayrollView({
  salaries,
  payments,
  advances,
  advanceHistory,
  penalties,
  employees,
  debt,
  canWrite,
  canManage,
  seeOthers,
  own,
  team = [],
}: PayrollViewProps) {
  const router = useRouter();
  const refresh = React.useCallback(() => router.refresh(), [router]);

  const [paymentFilter, setPaymentFilter] = React.useState<Filter>(EMPTY_FILTER);
  const [advanceFilter, setAdvanceFilter] = React.useState<Filter>(EMPTY_FILTER);

  const [paymentDialog, setPaymentDialog] = React.useState<{
    open: boolean;
    payment: SalaryPayment | null;
  }>({ open: false, payment: null });
  const [advanceDialog, setAdvanceDialog] = React.useState<{
    open: boolean;
    advance: Advance | null;
  }>({ open: false, advance: null });
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const deleting = useSingleFlight();

  const [penaltyEmployeeId, setPenaltyEmployeeId] = React.useState(
    employees[0]?.id ?? "",
  );
  const [penaltyReason, setPenaltyReason] = React.useState("");
  const [penaltyAmount, setPenaltyAmount] = React.useState("");
  const [penaltyComment, setPenaltyComment] = React.useState("");
  const penaltySubmit = useSingleFlight();

  const filteredPayments = React.useMemo(
    () => payments.filter((p) => matches(p, paymentFilter)),
    [payments, paymentFilter],
  );
  const filteredAdvances = React.useMemo(
    () =>
      advances.filter(
        (a) =>
          matches(a, advanceFilter) &&
          (advanceFilter.method === "all" || a.paymentMethod === advanceFilter.method),
      ),
    [advances, advanceFilter],
  );
  const paymentsTotal = filteredPayments.reduce((s, p) => s + p.amount, 0);
  const advancesTotal = filteredAdvances.reduce((s, a) => s + a.amount, 0);
  const periodLabel = (f: Filter) => (f.from || f.to ? "за выбранный период" : "за всё время");

  function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    void deleting.run(async () => {
      const url =
        target.kind === "payment"
          ? `/api/payroll/salaries/${target.row.id}`
          : `/api/payroll/advances/${target.row.id}`;
      try {
        const res = await fetch(url, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Не удалось удалить запись");
        toast.success(target.kind === "payment" ? "Выплата удалена" : "Аванс удалён");
        setDeleteTarget(null);
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка сети");
      }
    });
  }

  function submitPenalty(e: React.FormEvent) {
    e.preventDefault();
    if (!penaltyEmployeeId || !penaltyReason.trim()) return;
    void penaltySubmit.run(async () => {
      try {
        const res = await fetch("/api/payroll/penalties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: penaltyEmployeeId,
            reason: penaltyReason.trim(),
            amount: Number(penaltyAmount),
            comment: penaltyComment || null,
            date: todayDate(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не удалось создать штраф");
        toast.success("Штраф создан");
        setPenaltyReason("");
        setPenaltyAmount("");
        setPenaltyComment("");
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка");
      }
    });
  }

  const editPayment = canWrite
    ? (p: PaymentRow) => () => setPaymentDialog({ open: true, payment: p })
    : null;
  const removePayment = canManage
    ? (p: PaymentRow) => () => setDeleteTarget({ kind: "payment", row: p })
    : null;
  const editAdvance = canWrite
    ? (a: AdvanceRow) => () => setAdvanceDialog({ open: true, advance: a })
    : null;
  const removeAdvance = canManage
    ? (a: AdvanceRow) => () => setDeleteTarget({ kind: "advance", row: a })
    : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Зарплаты и авансы
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {seeOthers
            ? "Выплаты, авансы, начисления, штрафы и долг мастерам"
            : "Ваши выплаты, авансы, начисления и штрафы"}
        </p>
      </header>

      {own && <OwnSummary own={own} />}
      {team.length > 0 && <TeamPayroll team={team} />}

      <Tabs defaultValue={own ? "advances" : "payments"}>
        <TabsList className="h-auto max-w-full justify-start scroll-x">
          <TabsTrigger value="payments">Выплаты</TabsTrigger>
          <TabsTrigger value="advances">Авансы</TabsTrigger>
          {seeOthers && canWrite && <TabsTrigger value="advance-history">История авансов</TabsTrigger>}
          <TabsTrigger value="salaries">Начисления</TabsTrigger>
          <TabsTrigger value="penalties">Штрафы</TabsTrigger>
          {seeOthers && (
            <TabsTrigger value="debt">Долг мастерам</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="payments" className="mt-4 space-y-4">
          <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <FilterBar
                filter={paymentFilter}
                onChange={setPaymentFilter}
                employees={employees}
                seeOthers={seeOthers}
              />
            </div>
            {canWrite && employees.length > 0 && (
              <Button
                className="shrink-0"
                onClick={() => setPaymentDialog({ open: true, payment: null })}
              >
                <Plus className="size-4" />
                Выдать зарплату
              </Button>
            )}
          </div>
          <TotalCard
            label={`Выплачено ${periodLabel(paymentFilter)}`}
            total={paymentsTotal}
            count={filteredPayments.length}
          />

          {filteredPayments.length === 0 ? (
            <EmptyPanel title="Выплат за период нет" />
          ) : (
            <>
              <MobileList aria-label="Выплаты зарплаты">
                {filteredPayments.map((p) => (
                  <MobileListItem
                    key={p.id}
                    title={seeOthers ? p.employeeName : formatDateRu(p.date)}
                    subtitle={p.comment ?? undefined}
                    meta={[
                      seeOthers && formatDateRu(p.date),
                      `выдал ${p.authorName}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    value={formatKzt(p.amount)}
                    valueMeta={
                      <RowActions
                        label="выплату"
                        onEdit={editPayment?.(p)}
                        onDelete={removePayment?.(p)}
                      />
                    }
                  />
                ))}
              </MobileList>
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        {seeOthers && <TableHead>Сотрудник</TableHead>}
                        <TableHead className="text-right">Сумма</TableHead>
                        <TableHead>Комментарий</TableHead>
                        <TableHead>Выдал</TableHead>
                        <TableHead className="w-[96px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="tabular-nums">{formatDateRu(p.date)}</TableCell>
                          {seeOthers && (
                            <TableCell className="font-medium">{p.employeeName}</TableCell>
                          )}
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatKzt(p.amount)}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate text-muted-foreground">
                            {p.comment ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{p.authorName}</TableCell>
                          <TableCell>
                            <RowActions
                              label="выплату"
                              onEdit={editPayment?.(p)}
                              onDelete={removePayment?.(p)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="advances" className="mt-4 space-y-4">
          <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <FilterBar
                filter={advanceFilter}
                onChange={setAdvanceFilter}
                employees={employees}
                seeOthers={seeOthers}
                withMethod
              />
            </div>
            {canWrite && employees.length > 0 && (
              <Button
                className="shrink-0"
                onClick={() => setAdvanceDialog({ open: true, advance: null })}
              >
                <Plus className="size-4" />
                Выдать аванс
              </Button>
            )}
          </div>
          <TotalCard
            label={`Авансов выдано ${periodLabel(advanceFilter)}`}
            total={advancesTotal}
            count={filteredAdvances.length}
          />

          {filteredAdvances.length === 0 ? (
            <EmptyPanel title="Авансов за период нет" />
          ) : (
            <>
              <MobileList aria-label="Авансы">
                {filteredAdvances.map((a) => (
                  <MobileListItem
                    key={a.id}
                    title={seeOthers ? a.employeeName : formatDateRu(a.date)}
                    subtitle={a.comment ?? undefined}
                    meta={[
                      seeOthers && formatDateRu(a.date),
                      PAYMENT_METHOD_LABELS[a.paymentMethod],
                      `выдал ${a.authorName}`,
                      a.receipt && "чек",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    value={formatKzt(a.amount)}
                    valueMeta={
                      <RowActions
                        label="аванс"
                        onEdit={editAdvance?.(a)}
                        onDelete={removeAdvance?.(a)}
                      />
                    }
                  />
                ))}
              </MobileList>
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        {seeOthers && <TableHead>Сотрудник</TableHead>}
                        <TableHead className="text-right">Сумма</TableHead>
                        <TableHead>Способ</TableHead>
                        <TableHead>Назначение</TableHead>
                        <TableHead>Выдал</TableHead>
                        <TableHead>Чек</TableHead>
                        <TableHead className="w-[96px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdvances.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="tabular-nums">{formatDateRu(a.date)}</TableCell>
                          {seeOthers && (
                            <TableCell className="font-medium">{a.employeeName}</TableCell>
                          )}
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatKzt(a.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {PAYMENT_METHOD_LABELS[a.paymentMethod]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate text-muted-foreground">
                            {a.comment ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{a.authorName}</TableCell>
                          <TableCell>
                            {a.receipt ? (
                              <a
                                href={a.receipt.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                <Paperclip className="size-4" aria-hidden />
                                Открыть
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <RowActions
                              label="аванс"
                              onEdit={editAdvance?.(a)}
                              onDelete={removeAdvance?.(a)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {seeOthers && canWrite && (
          <TabsContent value="advance-history" className="mt-4">
            {advanceHistory.length === 0 ? <EmptyPanel title="История авансов пока пуста" /> : (
              <Card><CardContent className="divide-y p-0">
                {advanceHistory.map((entry) => (
                  <div key={entry.id} className="space-y-1 px-4 py-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <span className="font-medium">{entry.actorName}</span>
                      <time className="text-muted-foreground" dateTime={entry.createdAt}>
                        {new Date(entry.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.action}</p>
                    {entry.entityId && <p className="text-xs text-muted-foreground">Аванс: {entry.entityId}</p>}
                  </div>
                ))}
              </CardContent></Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="salaries" className="mt-4">
          {salaries.length === 0 ? (
            <EmptyPanel title="Начислений пока нет" />
          ) : (
          <>
          <MobileList aria-label="Начисления">
            {salaries.map((s) => (
              <MobileListItem
                key={s.id}
                title={seeOthers ? s.employeeName : formatPeriod(s.period)}
                subtitle={seeOthers ? formatPeriod(s.period) : undefined}
                meta={salaryBreakdown(s)}
                value={formatKzt(s.netAmount)}
                valueMeta={
                  <Badge variant={s.status === "paid" ? "success" : "outline"}>
                    {s.status === "paid" ? "Выплачено" : "Ожидает"}
                  </Badge>
                }
              />
            ))}
          </MobileList>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {seeOthers && <TableHead>Сотрудник</TableHead>}
                    <TableHead>Период</TableHead>
                    <TableHead className="text-right">База</TableHead>
                    <TableHead className="text-right">Бонус</TableHead>
                    <TableHead className="text-right">Штрафы</TableHead>
                    <TableHead className="text-right">Авансы</TableHead>
                    <TableHead className="text-right">К выплате</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaries.map((s) => (
                    <TableRow key={s.id}>
                      {seeOthers && (
                        <TableCell className="font-medium">
                          {s.employeeName}
                        </TableCell>
                      )}
                      <TableCell className="tabular-nums">{formatPeriod(s.period)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKzt(s.baseAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKzt(s.bonus)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKzt(s.penalties)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKzt(s.advances)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatKzt(s.netAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.status === "paid" ? "success" : "outline"}
                        >
                          {s.status === "paid" ? "Выплачено" : "Ожидает"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
          )}
        </TabsContent>

        <TabsContent value="penalties" className="mt-4 space-y-4">
          {canWrite && employees.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Добавить штраф</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={submitPenalty}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <div className="space-y-2">
                    <Label>Сотрудник</Label>
                    <Select
                      value={penaltyEmployeeId}
                      onValueChange={setPenaltyEmployeeId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pen-amount">Сумма, ₸</Label>
                    <Input
                      id="pen-amount"
                      type="number"
                      min={1}
                      step={1000}
                      value={penaltyAmount}
                      onChange={(e) => setPenaltyAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="pen-reason">Причина</Label>
                    <Input
                      id="pen-reason"
                      value={penaltyReason}
                      onChange={(e) => setPenaltyReason(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="pen-comment">Комментарий</Label>
                    <Textarea
                      id="pen-comment"
                      value={penaltyComment}
                      onChange={(e) => setPenaltyComment(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={penaltySubmit.busy}>
                      {penaltySubmit.busy ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Сохранение…
                        </>
                      ) : (
                        "Создать штраф"
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {penalties.length === 0 ? (
            <EmptyPanel title="Штрафов нет" />
          ) : (
          <>
          <MobileList aria-label="Штрафы">
            {penalties.map((p) => (
              <MobileListItem
                key={p.id}
                title={seeOthers ? p.employeeName : p.reason}
                subtitle={seeOthers ? p.reason : (p.comment ?? undefined)}
                meta={`${formatDateRu(p.date)}, ${p.auto ? "авто" : "вручную"}`}
                value={formatKzt(p.amount)}
                valueMeta={p.status === "active" ? "Активен" : "Отменён"}
              />
            ))}
          </MobileList>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {seeOthers && <TableHead>Сотрудник</TableHead>}
                    <TableHead>Дата</TableHead>
                    <TableHead>Причина</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {penalties.map((p) => (
                    <TableRow key={p.id}>
                      {seeOthers && (
                        <TableCell className="font-medium">
                          {p.employeeName}
                        </TableCell>
                      )}
                      <TableCell className="tabular-nums">{formatDateRu(p.date)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <p>{p.reason}</p>
                        {p.comment && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {p.comment}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKzt(p.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.auto ? "secondary" : "outline"}>
                          {p.auto ? "Авто" : "Ручной"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.status === "active" ? "Активен" : "Отменён"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
          )}
        </TabsContent>

        {seeOthers && (
          <TabsContent value="debt" className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-panel p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">Всего должны мастерам</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                {formatKzt(debt.totalDebt)}
              </p>
            </div>

            {debt.masters.length === 0 ? (
              <EmptyPanel title="Начислений мастерам нет" />
            ) : (
            <>
            <MobileList aria-label="Долг мастерам">
              {debt.masters.map((m) => (
                <MobileListItem
                  key={m.employeeId}
                  title={m.fullName}
                  meta={[
                    `Заработано ${formatKzt(m.earned)}`,
                    m.advances > 0 && `авансы ${formatKzt(m.advances)}`,
                    m.penalties > 0 && `штрафы ${formatKzt(m.penalties)}`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  value={formatKzt(m.owed)}
                  valueMeta="к выплате"
                />
              ))}
            </MobileList>
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Мастер</TableHead>
                      <TableHead className="text-right">Заработано</TableHead>
                      <TableHead className="text-right">Авансы</TableHead>
                      <TableHead className="text-right">Штрафы</TableHead>
                      <TableHead className="text-right">К выплате</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debt.masters.map((m) => (
                      <TableRow key={m.employeeId}>
                        <TableCell className="font-medium">
                          {m.fullName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKzt(m.earned)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKzt(m.advances)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKzt(m.penalties)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatKzt(m.owed)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </>
            )}
          </TabsContent>
        )}
      </Tabs>

      <SalaryPaymentDialog
        open={paymentDialog.open}
        onOpenChange={(open) => setPaymentDialog((d) => ({ ...d, open }))}
        employees={employees}
        payment={paymentDialog.payment}
        onSaved={refresh}
      />
      <AdvanceDialog
        open={advanceDialog.open}
        onOpenChange={(open) => setAdvanceDialog((d) => ({ ...d, open }))}
        employees={employees}
        advance={advanceDialog.advance}
        onSaved={refresh}
      />
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deleting.busy && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.kind === "payment" ? "Удалить выплату?" : "Удалить аванс?"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget &&
                `${deleteTarget.row.employeeName}, ${formatDateRu(deleteTarget.row.date)}, ${formatKzt(deleteTarget.row.amount)}. Удаление попадёт в журнал действий.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              disabled={deleting.busy}
              onClick={() => setDeleteTarget(null)}
            >
              Отмена
            </Button>
            <Button variant="destructive" disabled={deleting.busy} onClick={confirmDelete}>
              {deleting.busy && <Loader2 className="size-4 animate-spin" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
