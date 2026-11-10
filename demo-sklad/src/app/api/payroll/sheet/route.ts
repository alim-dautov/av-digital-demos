import { withUser, fileResponse, XLSX } from "@/lib/http";
import { sheetsBuffer } from "@/lib/xlsx";
import { currentPeriodKey, payrollSheet } from "@/modules/payroll/service";
import { getSetting } from "@/modules/settings/store";

export const runtime = "nodejs";

/** Ведомость за период: свод + детализация начислений по сотрудникам */
export const GET = withUser(async (req, { db, p }) => {
  const key = new URL(req.url).searchParams.get("period") ?? currentPeriodKey((await getSetting(db, "payroll")).periodKind);
  const s = await payrollSheet(db, p, key);
  const codes = [...new Set(s.slips.flatMap((x) => x.slip.lines.map((l) => l.label)))];
  const summary = {
    name: "Ведомость", title: `Зарплатная ведомость · ${s.period.label}${s.closed ? " (закрыт)" : ""}`,
    cols: [{ header: "Сотрудник", width: 26 }, { header: "Должность", width: 18 }, ...codes.map((c) => ({ header: c, money: true })), { header: "Начислено", money: true }, { header: "Аванс", money: true }, { header: "Выплачено", money: true }, { header: "Остаток", money: true }],
    rows: s.slips.map(({ user, slip }) => [user.name, user.position ?? "", ...codes.map((c) => slip.lines.filter((l) => l.label === c).reduce((a, l) => a + l.amount, 0)), slip.accrued, slip.advances, slip.payouts, slip.balanceAfterPayouts]),
  };
  const detail = {
    name: "Детализация", cols: [{ header: "Сотрудник", width: 22 }, { header: "Статья", width: 24 }, { header: "Основание", width: 60 }, { header: "Сумма", money: true }],
    rows: s.slips.flatMap(({ user, slip }) => slip.lines.flatMap((l) => (l.details.length ? l.details : [{ label: "—", amount: l.amount }]).map((d) => [user.name, l.label, d.label + (d.note ? ` · ${d.note}` : ""), d.amount ?? null]))),
  };
  return fileResponse(await sheetsBuffer([summary, detail]), `Ведомость_${key}.xlsx`, XLSX);
});
