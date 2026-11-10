import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { canSeeFinance } from "@/lib/rbac";
import {
  getOrdersTrend,
  type AnalyticsPeriod,
} from "@/lib/services/analytics";

const PERIODS: AnalyticsPeriod[] = [
  "today",
  "week",
  "month",
  "quarter",
  "year",
];

export async function GET(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canSeeFinance(session)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = (searchParams.get("period") ?? "month") as AnalyticsPeriod;
  const period = PERIODS.includes(periodParam) ? periodParam : "month";

  const trend = getOrdersTrend(session.companyId, period);
  return NextResponse.json({ period, trend });
}
