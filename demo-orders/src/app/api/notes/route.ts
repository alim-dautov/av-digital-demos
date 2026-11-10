import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { mutateData } from "@/lib/db";
import { idSchema, parseJson } from "@/lib/api";
import { generateId, nowIso } from "@/lib/utils";
import type { EntityNote } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

const bodySchema = z.object({
  entityType: z.enum(["client", "order"]),
  entityId: idSchema,
  text: z.string().trim().min(1).max(4000),
});

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const { data: body, error } = await parseJson(req, bodySchema);
  if (error) return error;
  const { entityType, entityId, text } = body;

  const resource = entityType === "client" ? "clients" : "orders";
  if (!can(session, resource, "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  let note: EntityNote | null = null;
  mutateData((data) => {
    const draft: EntityNote = {
      id: generateId("note"),
      text,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      authorId: session.id,
      authorName: session.fullName,
    };
    if (entityType === "client") {
      const client = data.clients.find(
        (c) => c.id === entityId && c.companyId === session.companyId,
      );
      if (!client) return;
      if (!client.notes) client.notes = [];
      client.notes.push(draft);
    } else {
      const order = data.orders.find(
        (o) =>
          o.companyId === session.companyId &&
          isActiveOrder(o) &&
          (o.id === entityId || o.number === entityId),
      );
      if (!order) return;
      if (!order.orderNotes) order.orderNotes = [];
      order.orderNotes.push(draft);
      order.updatedAt = nowIso();
    }
    note = draft;
  });

  if (!note) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  return NextResponse.json({ ok: true, note });
}
