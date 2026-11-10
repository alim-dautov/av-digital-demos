import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import {
  dateSchema,
  furnitureOrderStatusSchema,
  idSchema,
  leadSourceSchema,
  optional,
  optionalText,
  parseJson,
  rejectForeignRefs,
  stageKeySchema,
  workerVisibilitySchema,
} from "@/lib/api";
import { createOrder } from "@/lib/services/orders";
import { findOrCreateOrderClient } from "@/lib/services/clients";

const money = z.coerce.number().finite().min(0).max(10_000_000_000);

const bodySchema = z.object({
  clientId: optional(idSchema),
  address: z.string().trim().max(500).optional(),
  prepayment: optional(money),
  /** New client typed right in the order form (name + phone). */
  newClient: z
    .object({
      fullName: z.string().trim().min(1).max(200),
      phone: z.string().trim().min(1).max(50),
    })
    .optional(),
  source: leadSourceSchema,
  description: z.string().trim().min(1).max(2000),
  deadline: dateSchema,
  amount: money,
  status: optional(furnitureOrderStatusSchema),
  cost: optional(money),
  date: optional(dateSchema),
  responsibleId: optional(idSchema),
  masterId: optional(idSchema),
  masterIds: z.array(idSchema).max(2).refine((ids) => new Set(ids).size === ids.length, "Выберите разных мастеров").optional(),
  comment: optionalText(2000),
  furnitureUnits: optional(z.coerce.number().int().min(0).max(10_000)),
  materialsNote: optionalText(2000),
  hardwareNote: optionalText(2000),
  stages: z.array(stageKeySchema).max(30).optional(),
  workerVisibility: workerVisibilitySchema.nullable().optional(),
});

export async function POST(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "orders", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { data: body, error } = await parseJson(
    request,
    bodySchema,
    "Заполните обязательные поля: клиент, источник, сумма, дедлайн, описание",
  );
  if (error) return error;
  if (!body.clientId && !body.newClient) {
    return NextResponse.json({ error: "Выберите клиента или укажите нового" }, { status: 400 });
  }
  if (!body.clientId && !can(session, "clients", "write")) {
    return NextResponse.json({ error: "Недостаточно прав для создания клиента" }, { status: 403 });
  }

  const foreign = rejectForeignRefs(session.companyId, {
    clientId: body.clientId ?? undefined,
    employeeIds: [body.responsibleId, body.masterId, ...(body.masterIds ?? [])],
  });
  if (foreign) return foreign;

  const clientId =
    body.clientId ??
    findOrCreateOrderClient(session.companyId, { ...body.newClient!, source: body.source }).id;

  const order = createOrder(
    session.companyId,
    {
      clientId,
      source: body.source,
      status: body.status ?? undefined,
      amount: body.amount,
      prepayment: body.prepayment ?? 0,
      address: body.address ?? "",
      cost: body.cost ?? undefined,
      date: body.date ?? undefined,
      deadline: body.deadline,
      responsibleId: body.responsibleId ?? null,
      masterId: body.masterId ?? null,
      masterIds: body.masterIds,
      description: body.description,
      comment: body.comment,
      furnitureUnits: body.furnitureUnits ?? undefined,
      materialsNote: body.materialsNote,
      hardwareNote: body.hardwareNote,
      stages: body.stages,
      workerVisibility: body.workerVisibility ?? null,
    },
    { id: session.id, name: session.fullName },
  );

  return NextResponse.json({ order }, { status: 201 });
}
