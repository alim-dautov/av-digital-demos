import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { quickSearch } from "@/modules/products/service";
import { listCounterparties } from "@/modules/counterparties/service";
import { listOrders } from "@/modules/orders/service";

/** Глобальный поиск: товары, контрагенты, заявки (с учётом прав) */
export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const only = sp.get("only");
  if (q.length < 2) return NextResponse.json({ products: [], counterparties: [], orders: [] });
  const db = await getDb();
  const want = (k: string) => !only || only === k;
  const [products, cps, ords] = await Promise.all([
    want("products") && can(u, "products") ? quickSearch(db, u, q, only ? 20 : 6) : [],
    want("counterparties") && can(u, "counterparties") ? listCounterparties(db, u, { q, kind: sp.get("kind") === "supplier" ? "supplier" : sp.get("kind") === "client" ? "client" : undefined, pageSize: only ? 20 : 5 }).then((r) => r.rows) : [],
    want("orders") && can(u, "orders") ? listOrders(db, u, { q, pageSize: 5 }).then((r) => r.rows) : [],
  ]);
  return NextResponse.json({
    products,
    counterparties: cps.map((c) => ({ id: c.id, name: c.name, phone: c.phone, kind: c.kind, segment: c.segment, isService: c.isService, clientDebt: c.clientDebt, managerId: c.managerId })),
    orders: ords.map((o) => ({ id: o.id, number: o.number, counterpartyName: o.counterpartyName, total: o.total, statusName: o.statusName, statusColor: o.statusColor })),
  }, { headers: { "Cache-Control": "private, max-age=10" } });
}
