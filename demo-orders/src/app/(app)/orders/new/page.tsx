import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listClients } from "@/lib/services/clients";
import { listEmployees } from "@/lib/services/employees";
import { selectableFunnel } from "@/lib/services/production-funnel";
import { CreateOrderForm } from "@/features/orders/create-order-form";

export default async function NewOrderPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session, "orders", "write")) redirect("/orders");

  const clients = listClients(session.companyId).map((c) => ({
    id: c.id,
    fullName: c.fullName,
    address: c.address,
  }));
  const employees = listEmployees(session.companyId);
  const employeeOpts = employees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
  }));
  const masters = employees
    .filter((e) => e.role === "MASTER" && e.status === "active")
    .map((e) => ({ id: e.id, fullName: e.fullName }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
          <Link href="/orders">
            <ArrowLeft className="size-4" aria-hidden />
            К заказам
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Новый заказ
          </h1>
          <p className="text-sm text-muted-foreground">
            После создания заказ появится в воронке и на доске производства.
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-panel p-5">
        <CreateOrderForm
          canCreateClient={can(session, "clients", "write")}
          clients={clients}
          employees={employeeOpts}
          masters={masters}
          funnel={selectableFunnel(session.companyId)}
        />
      </div>
    </div>
  );
}
