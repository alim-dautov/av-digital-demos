import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { withUser, fileResponse, XLSX } from "@/lib/http";
import { sheetsBuffer } from "@/lib/xlsx";
import { currentPeriodKey, payslip } from "@/modules/payroll/service";
import { getSetting } from "@/modules/settings/store";

export const runtime = "nodejs";

export const GET = withUser<{ userId: string }>(async (req, { db, p, params }) => {
  const id = Number(params.userId);
  const key = new URL(req.url).searchParams.get("period") ?? currentPeriodKey((await getSetting(db, "payroll")).periodKind);
  const slip = await payslip(db, p, id, key);
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
  const rows: (string | number | null)[][] = [];
  for (const l of slip.lines) {
    rows.push([l.label, "", l.amount]);
    for (const d of l.details) rows.push(["", d.label + (d.note ? ` · ${d.note}` : ""), d.amount ?? null]);
  }
  rows.push(["Начислено", "", slip.accrued], ["Аванс", "", -slip.advances], ["Выплачено", "", -slip.payouts], ["К выплате", "", slip.balanceAfterPayouts]);
  const buf = await sheetsBuffer([{ name: "Расчётный лист", title: `${u?.name ?? ""} · ${slip.period.label}`, cols: [{ header: "Статья", width: 28 }, { header: "Основание", width: 60 }, { header: "Сумма, ₸", money: true }], rows }]);
  return fileResponse(buf, `Расчётный_лист_${u?.name ?? id}_${key}.xlsx`, XLSX);
});
