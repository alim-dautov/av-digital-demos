import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { getData } from "@/lib/db";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success || (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to)) {
    return NextResponse.json({ error: "Некорректный период" }, { status: 400 });
  }
  const employeeId = session.employeeId;
  const work = employeeId ? getData().orders
    .filter((order) => order.companyId === session.companyId && isActiveOrder(order) && (order.masterId === employeeId || order.masterIds?.includes(employeeId) || order.responsibleId === employeeId || order.acceptedBy?.userId === session.id))
    .filter((order) => (!parsed.data.from || order.updatedAt.slice(0, 10) >= parsed.data.from) && (!parsed.data.to || order.updatedAt.slice(0, 10) <= parsed.data.to))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((order) => ({ id: order.id, number: order.number, description: order.description, status: order.status, deadline: order.deadline, updatedAt: order.updatedAt })) : [];
  return NextResponse.json({ work });
}
