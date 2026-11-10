import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { listEmployees } from "@/lib/services/employees";
import { listOrders } from "@/lib/services/orders";

/** Исполнители и заказы для формы новой задачи. */
export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "tasks", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const employees = listEmployees(session.companyId, { hidePhone: true })
    .filter((e) => e.status !== "fired")
    .map((e) => ({ id: e.id, fullName: e.fullName }));
  const orders = can(session, "orders", "read")
    ? listOrders(session.companyId).map((o) => ({
        id: o.id,
        number: o.number,
        description: o.description,
      }))
    : [];
  return NextResponse.json({ employees, orders });
}
