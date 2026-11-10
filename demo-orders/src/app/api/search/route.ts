import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getData } from "@/lib/db";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export async function GET(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const data = getData();
  const companyId = session.companyId;
  const role = session;

  const orders = (can(role, "orders", "read") ? data.orders : [])
    .filter(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.number.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q)),
    )
    .slice(0, 8)
    .map((o) => ({
      type: "order" as const,
      id: o.id,
      title: `Заказ ${o.number}`,
      subtitle: o.description,
      href: `/orders/${o.number}`,
    }));

  const clients = (can(role, "clients", "read") ? data.clients : [])
    .filter(
      (c) =>
        c.companyId === companyId &&
        (c.fullName.toLowerCase().includes(q) ||
          c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))),
    )
    .slice(0, 8)
    .map((c) => ({
      type: "client" as const,
      id: c.id,
      title: c.fullName,
      subtitle: c.phone,
      href: `/clients/${c.id}`,
    }));

  const employees = (can(role, "employees", "read") ? data.employees : [])
    .filter(
      (e) =>
        e.companyId === companyId && e.fullName.toLowerCase().includes(q),
    )
    .slice(0, 8)
    .map((e) => ({
      type: "employee" as const,
      id: e.id,
      title: e.fullName,
      subtitle: e.position,
      href: `/employees/${e.id}`,
    }));

  return NextResponse.json({
    results: [...orders, ...clients, ...employees],
  });
}
