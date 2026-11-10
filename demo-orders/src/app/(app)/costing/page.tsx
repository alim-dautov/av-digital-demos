import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { getData } from "@/lib/db";
import { listCostingOrders, orderProfit } from "@/lib/services/atelier-profit";
import { listExpenseCategories, listOrderExpenses } from "@/lib/services/order-expenses";
import { formatKzt } from "@/lib/utils";
import { Calculator } from "lucide-react";
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
import { CostingEditor } from "@/features/costing/costing-editor";
import { OrderPicker } from "@/features/costing/order-picker";
import { ATELIER_ORDER_STATUS_LABELS } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export default async function CostingPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await requirePageAccess("costing");
  if (!isTextilesCompany(session.companyId)) redirect("/");
  const { order: orderKey } = await searchParams;

  const rows = listCostingOrders(session.companyId);
  const options = rows.map((r) => ({
    number: r.number,
    label: `№${r.number} · ${r.clientName} · ${ATELIER_ORDER_STATUS_LABELS[r.status] ?? r.status}`,
  }));

  const data = getData();
  const order = orderKey
    ? data.orders.find(
        (o) =>
          o.companyId === session.companyId &&
          isActiveOrder(o) &&
          (o.number === orderKey || o.id === orderKey),
      )
    : undefined;

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Себестоимость</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Фактические расходы по заказу. Клиент эти данные не видит.
          </p>
        </div>
        {rows.length > 0 && <OrderPicker options={options} value={order?.number ?? null} />}
      </header>

      {order ? (
        <CostingEditor
          key={order.id}
          order={{
            id: order.id,
            number: order.number,
            status: ATELIER_ORDER_STATUS_LABELS[order.status as keyof typeof ATELIER_ORDER_STATUS_LABELS] ?? order.status,
            hasQuote: Boolean(order.atelierQuote),
          }}
          profit={orderProfit(data, order)}
          expenses={listOrderExpenses(session.companyId, order.id)}
          categories={listExpenseCategories(session.companyId)}
          canWrite={can(session, "costing", "write")}
        />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <EmptyState
            icon={Calculator}
            title="Заказов пока нет"
            description="Создайте расчёт в калькуляторе, и заказ появится здесь."
            action={{ label: "Открыть калькулятор", href: "/calculator" }}
          />
        </div>
      ) : (
        <>
          {orderKey && (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              Заказ «{orderKey}» не найден. Выберите заказ из списка.
            </p>
          )}
          <MobileList aria-label="Себестоимость заказов">
            {rows.map((r) => (
              <MobileListItem
                key={r.orderId}
                href={`/costing?order=${r.number}`}
                title={`№${r.number}, ${r.clientName}`}
                subtitle={ATELIER_ORDER_STATUS_LABELS[r.status] ?? r.status}
                meta={`Сумма ${formatKzt(r.revenue)}, расходы ${formatKzt(r.expenses)}`}
                value={formatKzt(r.netProfit)}
                valueMeta={`маржа ${r.marginPercent}%`}
              />
            ))}
          </MobileList>
          <div className="hidden overflow-hidden rounded-lg border border-border bg-panel md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Заказ</TableHead>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Сумма заказа</TableHead>
                  <TableHead className="text-right">Расходы</TableHead>
                  <TableHead className="text-right">Чистая прибыль</TableHead>
                  <TableHead className="text-right">Маржа</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.orderId}>
                    <TableCell>
                      <Link
                        href={`/costing?order=${r.number}`}
                        className="font-medium tabular-nums text-primary hover:underline"
                      >
                        №{r.number}
                      </Link>
                    </TableCell>
                    <TableCell>{r.clientName}</TableCell>
                    <TableCell>{ATELIER_ORDER_STATUS_LABELS[r.status] ?? r.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKzt(r.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.hasExpenses ? (
                        formatKzt(r.expenses)
                      ) : (
                        <span className="text-muted-foreground">не внесены</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatKzt(r.netProfit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.marginPercent}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
