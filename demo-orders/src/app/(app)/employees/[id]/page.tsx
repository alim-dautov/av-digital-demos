import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSession } from "@/lib/auth";
import { can, canSeeOthersPayroll } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { MeasurerToggle } from "@/features/employees/measurer-toggle";
import { getData } from "@/lib/db";
import { getEmployee } from "@/lib/services/employees";
import { sumAmounts } from "@/lib/services/payroll";
import { formatDateRu, formatKzt, formatTimeRu } from "@/lib/utils";
import type { CompensationType, Employee } from "@/types";
import { PAYMENT_METHOD_LABELS, ROLE_LABELS } from "@/types";
import { anyOrderStatusLabel } from "@/lib/services/orders";

const COMPENSATION_LABELS: Record<CompensationType, string> = {
  percentage: "Процент",
  fixed: "Оклад",
  from_profit: "От прибыли",
  percentage_projects: "Процент с проектов",
};

const STATUS_LABELS: Record<Employee["status"], string> = {
  active: "Активен",
  vacation: "Отпуск",
  fired: "Уволен",
};

const STATUS_VARIANT: Record<Employee["status"], "success" | "warning" | "secondary"> = {
  active: "success",
  vacation: "warning",
  fired: "secondary",
};

function Field({
  label,
  children,
  numeric,
}: {
  label: string;
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={numeric ? "mt-0.5 font-medium tabular-nums" : "mt-0.5 font-medium"}>
        {children}
      </dd>
    </div>
  );
}

function NotSet() {
  return <span className="font-normal text-muted-foreground">Не указан</span>;
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const isSelf = session.employeeId === id;
  if (!isSelf && !can(session, "employees", "read")) redirect("/");

  const employee = getEmployee(session.companyId, id);
  if (!employee) notFound();

  const showPayroll = canSeeOthersPayroll(session) || isSelf;
  const userNames = new Map(getData().users.map((u) => [u.id, u.fullName]));
  const authorName = (userId: string) => userNames.get(userId) ?? "—";

  const activeOrders = employee.orders.filter(
    (o) => o.status !== "closed" && o.status !== "lead",
  );
  const recentAttendance = employee.attendance.slice(0, 10);

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/employees">
            <ArrowLeft className="size-4" />
            К сотрудникам
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {employee.fullName}
          </h1>
          <Badge variant={STATUS_VARIANT[employee.status]}>
            {STATUS_LABELS[employee.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {employee.position}, {ROLE_LABELS[employee.role].toLowerCase()}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Карточка</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Телефон" numeric>
                {employee.phone}
              </Field>
              <Field label="Дата найма" numeric>
                {formatDateRu(employee.hireDate)}
              </Field>
              <Field label="Роль">{ROLE_LABELS[employee.role]}</Field>
              <Field label="Статус">{STATUS_LABELS[employee.status]}</Field>
            </dl>
            {isTextilesCompany(session.companyId) && (
              <div className="mt-4 border-t border-border pt-4">
                <MeasurerToggle
                  employeeId={employee.id}
                  initial={Boolean(employee.isMeasurer)}
                  canWrite={can(session, "employees", "write")}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Оплата</CardTitle>
          </CardHeader>
          <CardContent>
            {showPayroll ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Тип компенсации">
                  {COMPENSATION_LABELS[employee.compensationType]}
                </Field>
                <Field label="Процент" numeric>
                  {employee.percentage != null ? `${employee.percentage}%` : <NotSet />}
                </Field>
                <Field label="Оклад" numeric>
                  {employee.fixedSalary != null ? formatKzt(employee.fixedSalary) : <NotSet />}
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Финансовые данные других сотрудников скрыты
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {showPayroll && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Выплаты зарплаты</CardTitle>
              <CardDescription className="tabular-nums">
                Всего выплачено: {formatKzt(sumAmounts(employee.salaryPayments))}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {employee.salaryPayments.length === 0 ? (
                <EmptyState compact title="Выплат нет" />
              ) : (
                <>
                  <MobileList inset aria-label="Выплаты зарплаты">
                    {employee.salaryPayments.map((p) => (
                      <MobileListItem
                        key={p.id}
                        title={formatDateRu(p.date)}
                        subtitle={p.comment ?? undefined}
                        meta={`выдал ${authorName(p.authorId)}`}
                        value={formatKzt(p.amount)}
                      />
                    ))}
                  </MobileList>
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                        <TableHead>Комментарий</TableHead>
                        <TableHead>Выдал</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employee.salaryPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="tabular-nums">{formatDateRu(p.date)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatKzt(p.amount)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">
                            {p.comment ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {authorName(p.authorId)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Авансы</CardTitle>
              <CardDescription className="tabular-nums">
                Всего выдано: {formatKzt(sumAmounts(employee.advances))}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {employee.advances.length === 0 ? (
                <EmptyState compact title="Авансов нет" />
              ) : (
                <>
                  <MobileList inset aria-label="Авансы">
                    {employee.advances.map((a) => (
                      <MobileListItem
                        key={a.id}
                        title={formatDateRu(a.date)}
                        subtitle={a.comment ?? undefined}
                        meta={`${PAYMENT_METHOD_LABELS[a.paymentMethod]}, выдал ${authorName(a.authorId)}`}
                        value={formatKzt(a.amount)}
                        valueMeta={
                          a.receipt ? (
                            <a href={a.receipt.url} target="_blank" rel="noreferrer" className="text-primary">
                              Чек
                            </a>
                          ) : undefined
                        }
                      />
                    ))}
                  </MobileList>
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                        <TableHead>Назначение</TableHead>
                        <TableHead>Выдал</TableHead>
                        <TableHead>Чек</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employee.advances.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="tabular-nums">
                            {formatDateRu(a.date)}
                            <span className="block text-xs text-muted-foreground">
                              {PAYMENT_METHOD_LABELS[a.paymentMethod]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatKzt(a.amount)}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-muted-foreground">
                            {a.comment ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {authorName(a.authorId)}
                          </TableCell>
                          <TableCell>
                            {a.receipt ? (
                              <a
                                href={a.receipt.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                              >
                                Открыть
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Штрафы</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {employee.penalties.length === 0 ? (
                <EmptyState compact title="Штрафов нет" />
              ) : (
                <>
                  <MobileList inset aria-label="Штрафы">
                    {employee.penalties.map((p) => (
                      <MobileListItem
                        key={p.id}
                        title={p.reason}
                        meta={formatDateRu(p.date)}
                        value={formatKzt(p.amount)}
                      />
                    ))}
                  </MobileList>
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Причина</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employee.penalties.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="tabular-nums">{formatDateRu(p.date)}</TableCell>
                          <TableCell>{p.reason}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatKzt(p.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Текущие проекты</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activeOrders.length === 0 ? (
            <EmptyState compact title="Активных проектов нет" />
          ) : (
            <>
              <MobileList inset aria-label="Текущие проекты">
                {activeOrders.map((o) => (
                  <MobileListItem
                    key={o.id}
                    href={`/orders/${o.number}`}
                    title={`№${o.number}`}
                    subtitle={o.description}
                    valueMeta={
                      <>
                        <Badge variant="outline">{anyOrderStatusLabel(o.status)}</Badge>
                        <span className="mt-1 block tabular-nums">
                          до {formatDateRu(o.deadline)}
                        </span>
                      </>
                    }
                  />
                ))}
              </MobileList>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дедлайн</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link
                          href={`/orders/${o.number}`}
                          className="font-medium tabular-nums text-primary hover:underline"
                        >
                          №{o.number}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        {o.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {anyOrderStatusLabel(o.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDateRu(o.deadline)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Посещаемость</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentAttendance.length === 0 ? (
            <EmptyState compact title="Отметок пока нет" />
          ) : (
            <>
              <MobileList inset aria-label="Посещаемость">
                {recentAttendance.map((a) => (
                  <MobileListItem
                    key={a.id}
                    title={formatDateRu(a.date)}
                    meta={`Приход в ${formatTimeRu(a.checkInAt)}`}
                    value={
                      a.lateMinutes > 0 ? (
                        <span className="text-warning">+{a.lateMinutes} мин</span>
                      ) : (
                        <span className="font-normal text-muted-foreground">Вовремя</span>
                      )
                    }
                    valueMeta={
                      showPayroll && a.penaltyAmount > 0
                        ? `штраф ${formatKzt(a.penaltyAmount)}`
                        : undefined
                    }
                  />
                ))}
              </MobileList>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Приход</TableHead>
                    <TableHead className="text-right">Опоздание</TableHead>
                    {showPayroll && <TableHead className="text-right">Штраф</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAttendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="tabular-nums">{formatDateRu(a.date)}</TableCell>
                      <TableCell className="tabular-nums">{formatTimeRu(a.checkInAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.lateMinutes > 0 ? (
                          <span className="text-warning">{a.lateMinutes} мин</span>
                        ) : (
                          <span className="text-muted-foreground">Вовремя</span>
                        )}
                      </TableCell>
                      {showPayroll && (
                        <TableCell className="text-right tabular-nums">
                          {a.penaltyAmount > 0 ? (
                            formatKzt(a.penaltyAmount)
                          ) : (
                            <span className="text-muted-foreground">Нет</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
