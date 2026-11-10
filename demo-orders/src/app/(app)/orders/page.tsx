import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can, canDeleteOrders } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { listClients } from "@/lib/services/clients";
import { listEmployees } from "@/lib/services/employees";
import {
  getOrdersByStatus,
  getAtelierOrdersByStatus,
  listOrders,
} from "@/lib/services/orders";
import { orderVisibleInList } from "@/lib/services/atelier-orders";
import { isRestrictedOrderViewer, visibilityOf } from "@/lib/order-visibility";
import { selectableFunnel } from "@/lib/services/production-funnel";
import { OrdersView } from "@/features/orders/orders-view";
import { AtelierOrdersView } from "@/features/orders/atelier-orders-view";
import {
  activeAtelierOrder,
  orderBalance,
  orderPaymentsTotal,
  orderPrepayment,
} from "@/lib/domain/order-money";
import type { OrderStatus, AtelierOrderStatus } from "@/types";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session, "orders", "read")) redirect("/");

  const sp = await searchParams;
  const textiles = isTextilesCompany(session.companyId);

  const masterFilter =
    session.role === "MASTER" && session.employeeId
      ? { masterId: session.employeeId }
      : undefined;

  const rawOrders = listOrders(session.companyId, masterFilter);
  const clients = listClients(session.companyId);
  const employees = listEmployees(session.companyId);
  const clientMap = new Map(clients.map((c) => [c.id, c.fullName]));
  const empMap = new Map(employees.map((e) => [e.id, e.fullName]));

  if (textiles) {
    const visible = rawOrders.filter((order) =>
      orderVisibleInList(order, session.role),
    );
    const orders = visible.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status as AtelierOrderStatus,
      amount: o.amount,
      prepayment: orderPrepayment(o),
      paid: orderPaymentsTotal(o),
      balance: orderBalance(o),
      active: activeAtelierOrder(o.status),
      date: o.date,
      deadline: o.deadline,
      clientName: clientMap.get(o.clientId) ?? "Клиент не указан",
      responsibleName: o.responsibleId
        ? (empMap.get(o.responsibleId) ?? null)
        : null,
      description: o.description,
    }));
    void getAtelierOrdersByStatus(session.companyId);
    return (
      <AtelierOrdersView
        orders={orders}
        canWrite={can(session, "orders", "write")}
        canDelete={canDeleteOrders(session)}
        hideMoney={session.role === "SEAMSTRESS"}
        title={session.role === "SEAMSTRESS" ? "Заказы на пошив" : "Заказы"}
      />
    );
  }

  const statusCounts = getOrdersByStatus(session.companyId, masterFilter);
  const worker =
    isRestrictedOrderViewer(session.role) && !can(session, "orders", "write");
  const orders = rawOrders.map((o) => {
    const vis = visibilityOf(o);
    return {
      id: o.id,
      number: o.number,
      status: o.status as OrderStatus,
      amount: worker && !vis.amount ? 0 : o.amount,
      deadline: worker && !vis.deadline ? "" : o.deadline,
      clientName:
        worker && !vis.clientName
          ? "Клиент скрыт"
          : (clientMap.get(o.clientId) ?? "Клиент не указан"),
      masterName: [o.masterId, ...(o.masterIds ?? [])].filter((id, i, all): id is string => !!id && all.indexOf(id) === i).map((id) => empMap.get(id)).filter(Boolean).join(", ") || null,
      responsibleName: o.responsibleId
        ? (empMap.get(o.responsibleId) ?? null)
        : null,
      description: o.description,
    };
  });

  const clientOpts = clients.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    address: c.address,
  }));
  const employeeOpts = employees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
  }));
  const masterOpts = employees
    .filter((e) => e.role === "MASTER" && e.status === "active")
    .map((e) => ({ id: e.id, fullName: e.fullName }));

  return (
    <OrdersView
      orders={orders}
      statusCounts={statusCounts}
      canWrite={can(session, "orders", "write")}
      openCreate={sp.new === "1" && can(session, "orders", "write")}
      clients={clientOpts}
      employees={employeeOpts}
      masters={masterOpts}
      funnel={selectableFunnel(session.companyId)}
    />
  );
}
