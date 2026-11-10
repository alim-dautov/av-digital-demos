"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateRu, formatKzt } from "@/lib/utils";
import type { NotificationPrefs, NotificationType } from "@/types";

type SalaryRow = { period: string; baseAmount: number; bonus: number; penalties: number; advances: number; netAmount: number; status: string };
type PaymentRow = { amount: number; date: string; comment: string | null };
type WorkRow = { id: string; number: string; description: string; status: string; deadline: string; updatedAt: string };

const STATUS_LABELS: Record<string, string> = {
  lead: "Новая", application: "Заявка", contract: "Договор", approval: "Согласование", production: "Производство", installation: "Монтаж", closed: "Закрыт", awaiting: "Ожидает принятия", in_work: "В работе", completed: "Завершён", cancelled: "Отменён",
};

export function PersonalSettings({
  settings,
  notificationTypes,
  salary,
  payments,
  advances,
  penalties,
  work,
}: {
  settings: NotificationPrefs;
  notificationTypes: { type: NotificationType; label: string }[];
  salary: SalaryRow[];
  payments: PaymentRow[];
  advances: PaymentRow[];
  penalties: PaymentRow[];
  work: WorkRow[];
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(settings);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [salaryRows, setSalaryRows] = useState(salary);
  const [paymentRows, setPaymentRows] = useState(payments);
  const [advanceRows, setAdvanceRows] = useState(advances);
  const [penaltyRows, setPenaltyRows] = useState(penalties);
  const [workRows, setWorkRows] = useState(work);
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  async function loadPeriod() {
    if (dateFrom > dateTo) {
      toast.error("Начало периода позже окончания");
      return;
    }
    setLoadingPeriod(true);
    try {
      const query = `from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`;
      const [payrollResponse, workResponse] = await Promise.all([
        fetch(`/api/me/payroll?${query}`),
        fetch(`/api/me/work?${query}`),
      ]);
      const payroll = await payrollResponse.json();
      const workData = await workResponse.json();
      if (!payrollResponse.ok || !workResponse.ok) throw new Error(payroll.error ?? workData.error ?? "Не удалось загрузить период");
      setSalaryRows(payroll.salary ?? []);
      setPaymentRows(payroll.payments ?? []);
      setAdvanceRows(payroll.advances ?? []);
      setPenaltyRows(payroll.penalties ?? []);
      setWorkRows(workData.work ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoadingPeriod(false);
    }
  }

  async function saveNotifications() {
    setSavingNotifications(true);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifications),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить настройки");
      toast.success("Настройки уведомлений сохранены");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setSavingNotifications(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setSavingPassword(true);
    try {
      const response = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Не удалось изменить пароль");
      setPassword({ current: "", next: "", confirm: "" });
      toast.success("Пароль изменён");
      window.setTimeout(() => router.push("/login?passwordChanged=1"), 300);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setSavingPassword(false);
    }
  }

  const totalSalary = salaryRows.reduce((sum, row) => sum + row.netAmount, 0);
  const totalPayments = paymentRows.reduce((sum, row) => sum + row.amount, 0);
  const totalAdvances = advanceRows.reduce((sum, row) => sum + row.amount, 0);
  const totalPenalties = penaltyRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Личный кабинет</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Мои настройки</h1>
        <p className="mt-1 text-sm text-muted-foreground">Уведомления, безопасность, зарплата и история работ</p>
      </div>
      <Tabs defaultValue="notifications" className="space-y-4">
        <TabsList className="flex h-auto max-w-full justify-start gap-1 overflow-x-auto p-1">
          <TabsTrigger value="notifications">Уведомления</TabsTrigger>
          <TabsTrigger value="security">Безопасность</TabsTrigger>
          <TabsTrigger value="salary">Моя зарплата</TabsTrigger>
          <TabsTrigger value="work">Мои работы</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications">
          <Card>
            <CardHeader><CardTitle>Категории уведомлений</CardTitle><CardDescription>Обязательные системные сообщения не отключаются.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <Label htmlFor="pref-push" className="cursor-pointer">Push на телефон</Label>
                <Switch id="pref-push" checked={notifications.push} onCheckedChange={(checked) => setNotifications((current) => ({ ...current, push: checked }))} />
              </div>
              {notificationTypes.map(({ type, label }) => (
                <div key={type} className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                  <Label htmlFor={`pref-${type}`} className="cursor-pointer">{label}</Label>
                  <Switch id={`pref-${type}`} checked={!notifications.muted.includes(type)} onCheckedChange={(checked) => setNotifications((current) => ({ ...current, muted: checked ? current.muted.filter((item) => item !== type) : [...current.muted, type] }))} />
                </div>
              ))}
              <Button onClick={() => void saveNotifications()} disabled={savingNotifications}>
                {savingNotifications ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Сохранить
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="size-4" />Смена пароля</CardTitle><CardDescription>Пароль хранится в защищённом виде и не показывается в интерфейсе.</CardDescription></CardHeader>
            <CardContent>
              <form className="grid max-w-xl gap-4" onSubmit={changePassword}>
                <div className="space-y-2"><Label htmlFor="current-password">Текущий пароль</Label><Input id="current-password" type="password" autoComplete="current-password" value={password.current} onChange={(e) => setPassword({ ...password, current: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="new-password">Новый пароль</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="confirm-password">Повторите новый пароль</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} /></div>
                <Button type="submit" disabled={savingPassword}>{savingPassword ? <Loader2 className="size-4 animate-spin" /> : null} Изменить пароль</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="salary">
          <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} loading={loadingPeriod} onLoad={() => void loadPeriod()} />
          <div className="grid gap-3 sm:grid-cols-4"><Stat label="Итого начислено" value={formatKzt(totalSalary)} /><Stat label="Выплачено" value={formatKzt(totalPayments)} /><Stat label="Авансы" value={formatKzt(totalAdvances)} /><Stat label="Удержания" value={formatKzt(totalPenalties)} /></div>
          <Card className="mt-4"><CardHeader><CardTitle>История начислений</CardTitle></CardHeader><CardContent>{salaryRows.length ? <div className="divide-y divide-border">{salaryRows.map((row) => <div key={row.period} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-medium">{row.period}</span><span className="tabular-nums">{formatKzt(row.netAmount)}</span><Badge variant={row.status === "paid" ? "default" : "outline"}>{row.status === "paid" ? "Выплачено" : "Ожидает"}</Badge></div>)}</div> : <p className="text-sm text-muted-foreground">Начислений за период нет</p>}</CardContent></Card>
          <Card className="mt-4"><CardHeader><CardTitle>История выплат</CardTitle></CardHeader><CardContent>{paymentRows.length ? <div className="divide-y divide-border">{paymentRows.map((row, index) => <div key={`${row.date}-${index}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{formatDateRu(row.date)}{row.comment ? ` · ${row.comment}` : ""}</span><span className="font-medium tabular-nums">{formatKzt(row.amount)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Выплат за период нет</p>}</CardContent></Card>
        </TabsContent>
        <TabsContent value="work">
          <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} loading={loadingPeriod} onLoad={() => void loadPeriod()} />
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-4" />История заказов</CardTitle><CardDescription>Только заказы, назначенные вам или принятые вами в работу.</CardDescription></CardHeader><CardContent>{workRows.length ? <div className="divide-y divide-border">{workRows.map((row) => <div key={row.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><Link className="font-medium hover:text-primary" href={`/orders/${row.number}`}>Заказ №{row.number} · {row.description}</Link><p className="text-xs text-muted-foreground">Срок {formatDateRu(row.deadline)} · обновлён {formatDateRu(row.updatedAt)}</p></div><Badge variant="outline">{STATUS_LABELS[row.status] ?? row.status}</Badge></div>)}</div> : <p className="text-sm text-muted-foreground">Назначенных работ за период нет</p>}</CardContent></Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-panel p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>;
}

function PeriodFilter({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  loading,
  onLoad,
}: {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  loading: boolean;
  onLoad: () => void;
}) {
  return <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-panel p-3 sm:flex-row sm:items-end"><div className="flex-1 space-y-1"><Label htmlFor="personal-from">С</Label><Input id="personal-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="flex-1 space-y-1"><Label htmlFor="personal-to">По</Label><Input id="personal-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div><Button variant="outline" onClick={onLoad} disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : null} Обновить</Button></div>;
}
