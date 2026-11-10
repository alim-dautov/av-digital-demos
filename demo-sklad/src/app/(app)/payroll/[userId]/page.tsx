import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { flag } from "@/lib/rbac";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { currentPeriodKey, payslip } from "@/modules/payroll/service";
import { periodFromKey } from "@/modules/payroll/engine";
import { getSetting } from "@/modules/settings/store";
import { PayslipView, recentPeriodKeys } from "../_components/payslip-view";
import { PeriodSelect } from "../_components/payroll-tools";

export const metadata = { title: "Расчётный лист" };

export default async function UserPayslip({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ period?: string }> }) {
  const u = await requireUser();
  const { userId } = await params;
  const id = userId === "me" ? u.id : Number(userId);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [emp] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id));
  if (!emp) notFound();
  const cfg = await getSetting(db, "payroll");
  const key = (await searchParams).period ?? currentPeriodKey(cfg.periodKind);
  const slip = await payslip(db, u, id, key);
  const keys = recentPeriodKeys(cfg.periodKind, currentPeriodKey, addDays(today(), 0));
  if (!keys.includes(key)) keys.unshift(key);
  const own = id === u.id;
  return (
    <>
      <PageHeader back={flag(u, "seeSalaries") ? <BackLink href={`/payroll?period=${key}`}>Ведомость</BackLink> : undefined}
        title={own ? "Мой заработок" : emp.name} subtitle={slip.period.label}
        actions={<PeriodSelect keys={keys} labels={Object.fromEntries(keys.map((k) => [k, periodFromKey(k).label]))} value={key} />} />
      <PayslipView slip={slip} name={emp.name} pdfHref={`/api/pdf/payslip/${id}?period=${key}`} xlsxHref={`/api/payroll/payslip/${id}?period=${key}`} />
    </>
  );
}
