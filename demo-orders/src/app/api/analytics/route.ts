import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { bootstrap } from "@/lib/bootstrap";
import {
  getFullAnalytics,
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
  if (!can(session, "analytics", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = (searchParams.get("period") ?? "month") as AnalyticsPeriod;
  const period = PERIODS.includes(periodParam) ? periodParam : "month";

  const analytics = getFullAnalytics(session.companyId, period);
  return NextResponse.json(analytics);
}
