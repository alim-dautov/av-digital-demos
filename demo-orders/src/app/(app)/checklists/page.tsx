import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getData } from "@/lib/db";
import { listOrders } from "@/lib/services/orders";
import { formatDateRu, pluralRu } from "@/lib/utils";
import { anyOrderStatusLabel } from "@/lib/services/orders";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ChecklistsPage() {
  const session = await getSession();
  if (!session) return null;

  if (!can(session, "checklists", "read")) {
    return (
      <EmptyState
        className="min-h-[40dvh]"
        icon={ListChecks}
        title="Нет доступа к чек-листам"
        description="Попросите владельца открыть доступ к этому разделу."
      />
    );
  }

  const companyId = session.companyId;
  const checklistItems = getData().checklistItems.filter(
    (c) => c.companyId === companyId,
  );
  const byOrder = new Map<string, { total: number; done: number }>();
  for (const item of checklistItems) {
    const cur = byOrder.get(item.orderId) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (item.done) cur.done += 1;
    byOrder.set(item.orderId, cur);
  }

  const orders = listOrders(companyId)
    .filter((o) => byOrder.has(o.id))
    .map((o) => {
      const stats = byOrder.get(o.id)!;
      const percent = stats.total
        ? Math.round((stats.done / stats.total) * 100)
        : 0;
      return {
        id: o.id,
        number: o.number,
        description: o.description,
        status: o.status,
        deadline: o.deadline,
        total: stats.total,
        done: stats.done,
        percent,
      };
    })
    .sort((a, b) => a.percent - b.percent);

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Чек-листы</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {orders.length > 0
            ? `${pluralRu(orders.length, ["заказ", "заказа", "заказов"])} с чек-листом, сначала наименее готовые`
            : "Прогресс подготовки материалов и контроля по заказам"}
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <EmptyState
            icon={ListChecks}
            title="Чек-листов пока нет"
            description="Они появятся, когда в заказе будут указаны материалы."
            action={{ label: "К заказам", href: "/orders" }}
          />
        </div>
      ) : (
      <>
      <MobileList aria-label="Заказы с чек-листом">
        {orders.map((o) => (
          <MobileListItem
            key={o.id}
            href={`/orders/${o.id}?tab=checklist`}
            title={`№${o.number}`}
            subtitle={o.description}
            meta={
              <div className="flex items-center gap-2">
                <Progress
                  value={o.percent}
                  aria-label={`Готовность заказа №${o.number}`}
                  className="h-1.5 w-24 shrink-0"
                />
                <span>
                  {o.done} из {o.total}
                </span>
              </div>
            }
            value={`${o.percent}%`}
            valueMeta={`до ${formatDateRu(o.deadline)}`}
          />
        ))}
      </MobileList>
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заказ</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Прогресс</TableHead>
                <TableHead className="text-right">Пункты</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${o.id}?tab=checklist`}
                      className="font-medium tabular-nums text-primary hover:underline"
                    >
                      №{o.number}
                    </Link>
                    <p className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground">
                      {o.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {anyOrderStatusLabel(o.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDateRu(o.deadline)}
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={o.percent}
                        aria-label={`Готовность заказа №${o.number}`}
                        className="h-2 flex-1"
                      />
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {o.percent}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.done} из {o.total}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
