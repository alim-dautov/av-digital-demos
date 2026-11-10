import { NextResponse } from "next/server";
import { z } from "zod";
import { getData } from "@/lib/db";
import {
  ORDER_STATUS_LABELS,
  ATELIER_ORDER_STATUS_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  type AnyOrderStatus,
  type LeadSource,
  type OrderStatus,
  type ProductionStageKey,
} from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

function keysOf<K extends string>(record: Record<K, unknown>) {
  return Object.keys(record) as [K, ...K[]];
}

export const leadSourceSchema = z.enum(keysOf<LeadSource>(SOURCE_LABELS));
export const stageKeySchema = z.union([
  z.enum(keysOf(STAGE_LABELS)),
  z
    .string()
    .regex(/^custom_[a-z0-9]{1,40}$/)
    .transform((v) => v as ProductionStageKey),
]);
/** Галочки «что видит рабочий» для заказа. */
export const workerVisibilitySchema = z
  .object({
    amount: z.boolean(),
    clientName: z.boolean(),
    clientPhone: z.boolean(),
    address: z.boolean(),
    deadline: z.boolean(),
    materials: z.boolean(),
    media: z.boolean(),
    comments: z.boolean(),
    stages: z.boolean(),
  })
  .partial();

export const furnitureOrderStatusSchema = z.enum(keysOf<OrderStatus>(ORDER_STATUS_LABELS));
export const orderStatusSchema = z.enum([
  ...keysOf(ORDER_STATUS_LABELS),
  ...keysOf(ATELIER_ORDER_STATUS_LABELS),
] as [AnyOrderStatus, ...AnyOrderStatus[]]);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const idSchema = z.string().trim().min(1).max(64);
export const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/).max(40);

/** Пустая строка в необязательном поле считается отсутствующим значением. */
export const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullish());

type Parsed<T> = { data: T; error?: never } | { data?: never; error: NextResponse };

export async function parseJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  message = "Некорректные данные",
): Promise<Parsed<z.infer<S>>> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return { error: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { data: parsed.data };
}

type Refs = {
  clientId?: string | null;
  orderId?: string | null;
  employeeIds?: (string | null | undefined)[];
};

/** Проверяет, что связанные записи принадлежат компании. Возвращает 400 или null. */
export function rejectForeignRefs(companyId: string, refs: Refs): NextResponse | null {
  const data = getData();
  const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

  if (refs.clientId && !data.clients.some((c) => c.id === refs.clientId && c.companyId === companyId)) {
    return bad("Клиент не найден");
  }
  if (
    refs.orderId &&
    !data.orders.some(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.id === refs.orderId || o.number === refs.orderId),
    )
  ) {
    return bad("Заказ не найден");
  }
  for (const id of refs.employeeIds ?? []) {
    if (id && !data.employees.some((e) => e.id === id && e.companyId === companyId)) {
      return bad("Сотрудник не найден");
    }
  }
  return null;
}
