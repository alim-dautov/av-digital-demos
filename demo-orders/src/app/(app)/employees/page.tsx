import Link from "next/link";
import { QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageAccess } from "@/lib/auth";
import { listEmployees } from "@/lib/services/employees";
import type { CompensationType, Employee } from "@/types";
import { ROLE_LABELS } from "@/types";
import { pluralRu } from "@/lib/utils";

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

const STATUS_VARIANT: Record<
  Employee["status"],
  "success" | "warning" | "destructive"
> = {
  active: "success",
  vacation: "warning",
  fired: "destructive",
};

export default async function EmployeesPage() {
  const session = await requirePageAccess("employees");

  const employees = listEmployees(session.companyId, { hidePhone: true });
  const isMaster = session.role === "MASTER";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Сотрудники
          </h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {pluralRu(employees.length, ["человек", "человека", "человек"])} в команде
          </p>
        </div>
        {isMaster && (
          <Button asChild>
            <Link href="/attendance/scan">
              <QrCode className="size-4" />
              Сканировать QR
            </Link>
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {employees.map((e) => (
          <Link
            key={e.id}
            href={`/employees/${e.id}`}
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{e.fullName}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {e.position}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[e.status]}>
                    {STATUS_LABELS[e.status]}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{ROLE_LABELS[e.role]}</Badge>
                  <Badge variant="secondary">
                    {COMPENSATION_LABELS[e.compensationType]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
