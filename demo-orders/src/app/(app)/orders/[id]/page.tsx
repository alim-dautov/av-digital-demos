import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can, canDeleteOrders, canEditOrders, canSeeCosting, canSeeFinance } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { listActivityForEntity } from "@/lib/services/activity";
import { listEmployees } from "@/lib/services/employees";
import { getOrder } from "@/lib/services/orders";
import {
  isRestrictedOrderViewer,
  sanitizeOrderForWorker,
  visibilityOf,
  workerShare,
} from "@/lib/order-visibility";
import { getSettings } from "@/lib/services/settings";
import { OrderDetailView } from "@/features/orders/order-detail-view";
import { listOrderAudit } from "@/lib/services/production-order";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session, "orders", "read")) redirect("/");

  const { id } = await params;
  const { tab } = await searchParams;
  const order = getOrder(session.companyId, id);
  if (!order) notFound();

  if (
    session.role === "MASTER" &&
    session.employeeId &&
    order.masterId !== session.employeeId && !order.masterIds?.includes(session.employeeId)
  ) {
    redirect("/orders");
  }

  if (
    session.role === "SEAMSTRESS" &&
    !order.sewingOrderAt &&
    !order.proposalId
  ) {
    redirect("/orders");
  }

  const employees = listEmployees(session.companyId);
  const empMap = new Map(employees.map((e) => [e.id, e.fullName]));
  const history = listActivityForEntity(
    session.companyId,
    "order",
    order.id,
    40,
  );
  const textiles = isTextilesCompany(session.companyId);

  const allowedTabs = new Set([
    "overview",
    "client",
    "production",
    "checklist",
    "materials",
    "finance",
    "tasks",
    "reports",
    "media",
    "history",
  ]);
  const initialTab =
    tab &&
    allowedTabs.has(tab) &&
    (tab !== "finance" || canSeeFinance(session) || canSeeCosting(session))
      ? tab
      : "overview";

  const worker = isRestrictedOrderViewer(session.role) && !can(session, "orders", "write");
  const vis = visibilityOf(order);
  const shown = worker ? sanitizeOrderForWorker(order, vis) : order;
  let share: { percent: number; amount: number } | null = null;
  if (worker && vis.amount && session.employeeId) {
    const me = employees.find((e) => e.id === session.employeeId);
    if (me?.compensationType === "percentage") {
      const percent = me.percentage ?? getSettings(session.companyId).defaultAssemblerPercent;
      share = { percent, amount: workerShare(order.amount, percent) };
    }
  }

  return (
    <OrderDetailView
      workerView={worker ? { visibility: vis, share } : null}
      canEditVisibility={can(session, "orders", "write")}
      order={{
        ...shown,
        masterOptions: employees.filter((e) => e.role === "MASTER" && (e.status === "active" || e.id === order.masterId || order.masterIds?.includes(e.id))).map((e) => ({ id: e.id, fullName: e.fullName })),
        masterNames: [...new Set([order.masterId, ...(order.masterIds ?? [])].filter((id): id is string => !!id))].map((id) => empMap.get(id)).filter(Boolean).join(", "),
        responsibleName: order.responsibleId
          ? (empMap.get(order.responsibleId) ?? null)
          : null,
        master: order.master
          ? { id: order.master.id, fullName: order.master.fullName }
          : null,
        reports: order.reports.map((r) => ({
          ...r,
          employeeName: empMap.get(r.employeeId) ?? "Сотрудник",
        })),
        history: worker ? [] : history,
        audit: session.role === "OWNER" || session.role === "DIRECTOR" ? listOrderAudit(session.companyId, order.id) : [],
      }}
      canWrite={can(session, "orders", "write")}
      canDelete={canDeleteOrders(session)}
      canEdit={canEditOrders(session)}
      canToggleChecklist={
        can(session, "checklists", "write") ||
        can(session, "orders", "write")
      }
      canSeeFinance={canSeeFinance(session) || canSeeCosting(session)}
      canSeeCosting={canSeeCosting(session)}
      textiles={textiles}
      hidePrices={session.role === "SEAMSTRESS" || session.role === "WORKSHOP" || worker}
      canEditProduction={can(session, "production", "write") || can(session, "workshop", "write")}
      canViewProductionAudit={session.role === "OWNER" || session.role === "DIRECTOR"}
      productionDraftScope={`${session.companyId}:${session.id}:${order.id}`}
      initialTab={initialTab}
    />
  );
}
