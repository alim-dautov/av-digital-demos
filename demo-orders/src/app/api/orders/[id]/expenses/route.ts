import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { getData } from "@/lib/db";
import { can } from "@/lib/rbac";
import {
  addOrderExpense,
  deleteOrderExpense,
  ExpenseError,
  listExpenseCategories,
  listOrderExpenses,
  syncExpensesFromQuote,
  updateOrderExpense,
} from "@/lib/services/order-expenses";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

type Ctx = { params: Promise<{ id: string }> };

const amount = z.coerce.number().finite().min(0).max(10_000_000_000);
const note = z.string().trim().max(500).nullish();
const key = z.string().trim().min(1).max(64);

const postSchema = z.union([
  z.object({ action: z.literal("sync") }),
  z.object({
    category: key,
    name: z.string().trim().min(1).max(200),
    amount,
    note,
  }),
]);

const patchSchema = z.object({
  expenseId: key,
  category: key.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  amount: amount.optional(),
  note,
  resetToPlanned: z.boolean().optional(),
});

async function context(ctx: Ctx, action: "read" | "write") {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!can(session, "costing", action)) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  const { id } = await ctx.params;
  const order = getData().orders.find(
    (o) => o.companyId === session.companyId && isActiveOrder(o) && (o.id === id || o.number === id),
  );
  if (!order) {
    return { error: NextResponse.json({ error: "Заказ не найден" }, { status: 404 }) };
  }
  return { session, order };
}

function fail(e: unknown) {
  if (e instanceof ExpenseError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: "Не удалось сохранить расход" }, { status: 500 });
}

function payload(companyId: string, orderId: string) {
  return {
    expenses: listOrderExpenses(companyId, orderId),
    categories: listExpenseCategories(companyId),
  };
}

export async function GET(_request: Request, ctx: Ctx) {
  const { session, order, error } = await context(ctx, "read");
  if (error) return error;
  return NextResponse.json(payload(session.companyId, order.id));
}

export async function POST(request: Request, ctx: Ctx) {
  const { session, order, error } = await context(ctx, "write");
  if (error) return error;
  const { data, error: bad } = await parseJson(request, postSchema);
  if (bad) return bad;
  try {
    if ("action" in data) {
      const result = syncExpensesFromQuote(session.companyId, order.id, session.id);
      return NextResponse.json({ ...payload(session.companyId, order.id), sync: result });
    }
    addOrderExpense(session.companyId, order.id, data, session.id);
    return NextResponse.json(payload(session.companyId, order.id), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { session, order, error } = await context(ctx, "write");
  if (error) return error;
  const { data, error: bad } = await parseJson(request, patchSchema);
  if (bad) return bad;
  try {
    const { expenseId, ...patch } = data;
    updateOrderExpense(session.companyId, order.id, expenseId, patch);
    return NextResponse.json(payload(session.companyId, order.id));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { session, order, error } = await context(ctx, "write");
  if (error) return error;
  const expenseId = new URL(request.url).searchParams.get("expenseId");
  if (!expenseId) return NextResponse.json({ error: "Не указан расход" }, { status: 400 });
  try {
    deleteOrderExpense(session.companyId, order.id, expenseId);
    return NextResponse.json(payload(session.companyId, order.id));
  } catch (e) {
    return fail(e);
  }
}
