import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { withUser, fileResponse } from "@/lib/http";
import { PDF } from "@/lib/pdf/kit";
import { payslipPdf } from "@/lib/pdf/docs";
import { currentPeriodKey, payslip } from "@/modules/payroll/service";
import { getSetting } from "@/modules/settings/store";

export const runtime = "nodejs";

export const GET = withUser<{ userId: string }>(async (req, { db, p, params }) => {
  const id = Number(params.userId);
  const key = new URL(req.url).searchParams.get("period") ?? currentPeriodKey((await getSetting(db, "payroll")).periodKind);
  const slip = await payslip(db, p, id, key); // проверка доступа внутри
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
  const buf = await payslipPdf(await getSetting(db, "company"), u?.name ?? "", slip);
  return fileResponse(buf, `Расчётный_лист_${u?.name ?? id}_${key}.pdf`, PDF, true);
});
