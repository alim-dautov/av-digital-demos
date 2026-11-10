import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import {
  addExpenseCategory,
  deleteExpenseCategory,
  ExpenseError,
  listExpenseCategories,
} from "@/lib/services/order-expenses";

const postSchema = z.object({ label: z.string().trim().min(1).max(60) });

async function guard(action: "read" | "write") {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!can(session, "costing", action)) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { session };
}

function fail(e: unknown) {
  if (e instanceof ExpenseError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: "Не удалось сохранить категорию" }, { status: 500 });
}

export async function GET() {
  const { session, error } = await guard("read");
  if (error) return error;
  return NextResponse.json({ categories: listExpenseCategories(session.companyId) });
}

export async function POST(request: Request) {
  const { session, error } = await guard("write");
  if (error) return error;
  const { data, error: bad } = await parseJson(request, postSchema);
  if (bad) return bad;
  try {
    addExpenseCategory(session.companyId, data.label);
    return NextResponse.json({ categories: listExpenseCategories(session.companyId) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  const { session, error } = await guard("write");
  if (error) return error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указана категория" }, { status: 400 });
  try {
    deleteExpenseCategory(session.companyId, id);
    return NextResponse.json({ categories: listExpenseCategories(session.companyId) });
  } catch (e) {
    return fail(e);
  }
}
