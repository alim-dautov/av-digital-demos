import Link from "next/link";
import { redirect } from "next/navigation";
import { QrCode, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { can, canHostAttendanceQr, canSeeOthersPayroll } from "@/lib/rbac";
import {
  getLateToday,
  listAttendance,
} from "@/lib/services/attendance";
import { listEmployees } from "@/lib/services/employees";
import { cn, formatDateRu, formatKzt, formatTimeRu, todayDate } from "@/lib/utils";

export default async function AttendancePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!can(session, "attendance", "read")) {
    redirect("/");
  }

  const companyId = session.companyId;
  const today = todayDate();
  // Сотрудник видит только свои отметки; управляющий — всех, но без сумм штрафов.
  const seePay = canSeeOthersPayroll(session);
  const seeAll = seePay || canHostAttendanceQr(session);
  const scope = <T extends { employeeId: string; penaltyAmount: number }>(rows: T[]): T[] =>
    rows
      .filter((r) => seeAll || r.employeeId === session.employeeId)
      .map((r) =>
        seePay || r.employeeId === session.employeeId ? r : { ...r, penaltyAmount: 0 },
      );
  const attendance = scope(listAttendance(companyId, today));
  const late = scope(getLateToday(companyId));
  const employees = listEmployees(companyId, { hidePhone: true });
  const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

  const showWorkshopQr = canHostAttendanceQr(session);
  const canScan = can(session, "attendance", "write") && !!session.employeeId;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Посещаемость
          </h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            Сегодня, {formatDateRu(today)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canScan && (
            <Button asChild>
              <Link href="/attendance/scan">
                <ScanLine className="size-4" />
                Сканировать
              </Link>
            </Button>
          )}
          {showWorkshopQr && (
            <Button asChild variant="outline">
              <Link href="/attendance/qr">
                <QrCode className="size-4" />
                Экран QR
              </Link>
            </Button>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-lg border border-border bg-panel p-4 sm:p-5">
          <dt className="text-sm text-muted-foreground">Отметились</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
            {attendance.length}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-panel p-4 sm:p-5">
          <dt className="text-sm text-muted-foreground">Опоздали</dt>
          <dd
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl",
              late.length > 0 ? "text-warning" : "text-foreground",
            )}
          >
            {late.length}
          </dd>
        </div>
      </dl>

      {late.length > 0 && (
        <section aria-labelledby="late-title" className="space-y-3">
          <h2 id="late-title" className="text-base font-semibold">
            Опоздания сегодня
          </h2>
          <MobileList aria-label="Опоздания сегодня">
            {late.map((a) => (
              <MobileListItem
                key={a.id}
                title={a.employeeName}
                meta={`Приход в ${formatTimeRu(a.checkInAt)}`}
                value={<span className="text-warning">+{a.lateMinutes} мин</span>}
                valueMeta={a.penaltyAmount > 0 ? `штраф ${formatKzt(a.penaltyAmount)}` : "без штрафа"}
              />
            ))}
          </MobileList>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Сотрудник</TableHead>
                    <TableHead>Приход</TableHead>
                    <TableHead className="text-right">Опоздание</TableHead>
                    <TableHead className="text-right">Штраф</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {late.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.employeeName}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatTimeRu(a.checkInAt)}</TableCell>
                      <TableCell className="text-right tabular-nums text-warning">
                        {a.lateMinutes} мин
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.penaltyAmount > 0 ? (
                          formatKzt(a.penaltyAmount)
                        ) : (
                          <span className="text-muted-foreground">Без штрафа</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}

      <section aria-labelledby="checkins-title" className="space-y-3">
        <h2 id="checkins-title" className="text-base font-semibold">
          Все приходы за сегодня
        </h2>
        {attendance.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel">
            <EmptyState
              compact
              icon={ScanLine}
              title="Пока никто не отметился"
              description="Отметки появятся, когда сотрудники отсканируют QR-код в цехе."
            />
          </div>
        ) : (
          <>
            <MobileList aria-label="Все приходы за сегодня">
              {attendance.map((a) => (
                <MobileListItem
                  key={a.id}
                  title={nameById.get(a.employeeId) ?? "Сотрудник"}
                  subtitle={a.location}
                  value={formatTimeRu(a.checkInAt)}
                  valueMeta={
                    a.lateMinutes > 0 ? (
                      <Badge variant="warning">+{a.lateMinutes} мин</Badge>
                    ) : (
                      <Badge variant="success">Вовремя</Badge>
                    )
                  }
                />
              ))}
            </MobileList>
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Сотрудник</TableHead>
                      <TableHead>Время</TableHead>
                      <TableHead>Место</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {nameById.get(a.employeeId) ?? "Сотрудник"}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatTimeRu(a.checkInAt)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.location}
                        </TableCell>
                        <TableCell>
                          {a.lateMinutes > 0 ? (
                            <Badge variant="warning">+{a.lateMinutes} мин</Badge>
                          ) : (
                            <Badge variant="success">Вовремя</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </div>
  );
}
