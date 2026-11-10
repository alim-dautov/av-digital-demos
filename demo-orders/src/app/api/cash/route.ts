import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { addCashEntry, cashBalance, listCashEntries } from "@/lib/services/cash";

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "finance", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  return NextResponse.json({
    entries: listCashEntries(session.companyId),
    balance: cashBalance(session.companyId),
  });
}

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "finance", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = z
    .object({
      type: z.enum(["in", "out"]),
      amount: z.coerce.number().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
      category: z.string().trim().min(1).max(80),
      comment: z.string().max(500).optional(),
    })
    .safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  try {
    const entry = addCashEntry({
      companyId: session.companyId,
      ...parsed.data,
      source: "manual",
    });
    return NextResponse.json({ entry, balance: cashBalance(session.companyId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
