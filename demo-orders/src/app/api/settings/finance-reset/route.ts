import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import {
  canResetFinance,
  FINANCE_CATEGORIES,
  FinanceResetError,
  getFinanceCounts,
  resetFinanceData,
} from "@/lib/services/finance-reset";

const schema = z.object({
  confirm: z.literal("УДАЛИТЬ", { message: "Введите слово УДАЛИТЬ" }),
  categories: z.array(z.enum(FINANCE_CATEGORIES)).min(1, "Выберите, что удалить"),
});

async function guard() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!canResetFinance(session)) {
    return { error: NextResponse.json({ error: "Только владелец или администратор" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { session, error } = await guard();
  if (error) return error;
  return NextResponse.json({ counts: getFinanceCounts(session.companyId) });
}

export async function POST(request: Request) {
  const { session, error } = await guard();
  if (error) return error;
  const { data: body, error: bad } = await parseJson(request, schema);
  if (bad) return bad;
  try {
    const { removed, backup } = resetFinanceData(session.companyId, body.categories, {
      id: session.id,
      name: session.fullName,
    });
    return NextResponse.json({
      removed,
      backup: path.basename(backup),
      counts: getFinanceCounts(session.companyId),
    });
  } catch (e) {
    if (e instanceof FinanceResetError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
