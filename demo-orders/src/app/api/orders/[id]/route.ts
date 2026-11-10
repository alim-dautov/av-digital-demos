import { NextResponse } from "next/server";
import { z } from "zod";
import {
  dateSchema,
  idSchema,
  leadSourceSchema,
  optional,
  orderStatusSchema,
  parseJson,
  rejectForeignRefs,
  workerVisibilitySchema,
} from "@/lib/api";
import {
  isRestrictedOrderViewer,
  normalizeVisibility,
  sanitizeOrderForWorker,
} from "@/lib/order-visibility";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can, canDeleteOrders, canEditOrders } from "@/lib/rbac";
import { deleteOrder, OrderDeletionError } from "@/lib/services/order-deletion";
import {
  getOrder,
  updateOrder,
  updateOrderStatus,
} from "@/lib/services/orders";
import { isTextilesCompany } from "@/lib/company";
import { isAtelierStatus } from "@/lib/services/atelier-orders";
import { changeAtelierStatus, WorkshopError } from "@/lib/services/workshop";

type Ctx = { params: Promise<{ id: string }> };

const money = z.coerce.number().finite().min(0).max(10_000_000_000);
const nullableText = (max: number) =>
  z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(max).nullable()).optional();

const patchSchema = z.object({
  status: optional(orderStatusSchema),
  clientId: optional(idSchema),
  source: optional(leadSourceSchema),
  amount: optional(money),
  cost: optional(money),
  address: z.string().trim().max(500).optional(),
  date: optional(dateSchema),
  deadline: optional(dateSchema),
  closedAt: z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullable()).optional(),
  responsibleId: z.preprocess((v) => (v === "" ? null : v), idSchema.nullable()).optional(),
  masterId: z.preprocess((v) => (v === "" ? null : v), idSchema.nullable()).optional(),
  masterIds: z.array(idSchema).max(2).refine((ids) => new Set(ids).size === ids.length, "Выберите разных мастеров").optional(),
  description: optional(z.string().trim().min(1).max(2000)),
  comment: nullableText(2000),
  furnitureUnits: optional(z.coerce.number().int().min(0).max(10_000)),
  materialsNote: nullableText(2000),
  hardwareNote: nullableText(2000),
  workerVisibility: workerVisibilitySchema.nullable().optional(),
  prepayment: optional(money),
  clientName: optional(z.string().trim().min(1).max(200)),
  clientPhone: optional(z.string().trim().min(3).max(40)),
  clientAddress: nullableText(500),
});

const deleteSchema = z.object({
  confirmNumber: z.string().trim().min(1, "Введите номер заказа").max(64),
});

export async function GET(_request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "orders", "read") || session.role === "SEAMSTRESS") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const order = getOrder(session.companyId, id);
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  if (
    session.role === "MASTER" &&
    session.employeeId &&
    order.masterId !== session.employeeId && !order.masterIds?.includes(session.employeeId)
  ) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  if (isRestrictedOrderViewer(session.role) && !can(session, "orders", "write")) {
    return NextResponse.json({ order: sanitizeOrderForWorker(order) });
  }
  return NextResponse.json({ order });
}

export async function PATCH(request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "orders", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const { data: body, error } = await parseJson(request, patchSchema);
  if (error) return error;

  const actor = { id: session.id, name: session.fullName };

  if (body.status && isTextilesCompany(session.companyId)) {
    if (!isAtelierStatus(body.status)) {
      return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
    }
    try {
      const order = await changeAtelierStatus(session.companyId, id, body.status, actor);
      return NextResponse.json({ order });
    } catch (e) {
      if (e instanceof WorkshopError) {
        return NextResponse.json({ error: e.message, order: e.order }, { status: e.status });
      }
      throw e;
    }
  }

  if (body.status) {
    const updated = updateOrderStatus(session.companyId, id, body.status, actor);
    if (!updated) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }
    return NextResponse.json({ order: updated });
  }

  // Field edits (client, money, dates, comments) are for office roles; workers only move statuses.
  if (!canEditOrders(session)) {
    return NextResponse.json({ error: "Нет права на изменение заказа" }, { status: 403 });
  }

  const foreign = rejectForeignRefs(session.companyId, {
    clientId: body.clientId,
    employeeIds: [body.responsibleId, body.masterId, ...(body.masterIds ?? [])],
  });
  if (foreign) return foreign;

  const patch: Parameters<typeof updateOrder>[2] = {};
  if (body.clientId != null) patch.clientId = body.clientId;
  if (body.source != null) patch.source = body.source;
  if (body.amount != null) patch.amount = body.amount;
  if (body.cost != null) patch.cost = body.cost;
  if (body.address !== undefined) patch.address = body.address;
  if (body.date != null) patch.date = body.date;
  if (body.deadline != null) patch.deadline = body.deadline;
  if (body.closedAt !== undefined) patch.closedAt = body.closedAt;
  if (body.responsibleId !== undefined) patch.responsibleId = body.responsibleId;
  if (body.masterId !== undefined) patch.masterId = body.masterId;
  if (body.masterIds !== undefined) patch.masterIds = body.masterIds;
  if (body.description != null) patch.description = body.description;
  if (body.comment !== undefined) patch.comment = body.comment;
  if (body.workerVisibility !== undefined) {
    patch.workerVisibility = body.workerVisibility
      ? normalizeVisibility(body.workerVisibility)
      : null;
  }
  if (body.furnitureUnits != null) patch.furnitureUnits = body.furnitureUnits;
  if (body.materialsNote !== undefined) patch.materialsNote = body.materialsNote;
  if (body.hardwareNote !== undefined) patch.hardwareNote = body.hardwareNote;
  if (body.prepayment != null) patch.prepayment = body.prepayment;
  if (body.clientName != null || body.clientPhone != null || body.clientAddress !== undefined) {
    patch.client = {
      fullName: body.clientName ?? undefined,
      phone: body.clientPhone ?? undefined,
      address: body.clientAddress,
    };
  }

  const updated = updateOrder(session.companyId, id, patch, actor);
  if (!updated) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  return NextResponse.json({ order: updated });
}

export async function DELETE(request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canDeleteOrders(session)) {
    return NextResponse.json({ error: "Нет права на удаление заказов" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const { data: body, error } = await parseJson(request, deleteSchema);
  if (error) return error;

  try {
    const result = deleteOrder(
      session.companyId,
      id,
      { id: session.id, name: session.fullName },
      body.confirmNumber,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof OrderDeletionError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
