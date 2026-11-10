import { z } from "zod";

export const SEGMENTS = { bazaar: "Базар", shop: "Магазины", install: "Монтаж / заявки", other: "Прочее" } as const;
export type Segment = keyof typeof SEGMENTS;

const tierSchema = z.object({ fromPlanPct: z.number().min(0), rateBp: z.number().int().min(0).max(10000) });

export const paySchemeSchema = z.object({
  salary: z.object({
    amount: z.number().int().min(0), // тиын в месяц
    prorate: z.boolean().default(true),
    workWeek: z.union([z.literal(5), z.literal(6)]).default(6),
  }).optional(),
  salesPercent: z.object({
    basis: z.enum(["revenue", "profit"]).default("revenue"),
    scope: z.enum(["own", "segment", "department"]).default("own"),
    segment: z.enum(["bazaar", "shop", "install", "other"]).optional(),
    trigger: z.enum(["shipment", "paid"]).default("shipment"),
    tierMode: z.enum(["whole", "marginal"]).default("whole"),
    tiers: z.array(tierSchema).min(1),
    countReturns: z.boolean().default(true),
    skipNonPositiveMargin: z.boolean().default(false),
    excludeProductIds: z.array(z.number().int()).default([]),
    excludeFolderIds: z.array(z.number().int()).default([]),
  }).optional(),
  piecework: z.object({
    per: z.enum(["order", "item", "unit"]).default("order"),
    rate: z.number().int().min(0), // тиын
    minPerShift: z.number().int().min(0).default(0),
  }).optional(),
  kpiBonus: z.object({
    planThresholds: z.array(z.object({ pct: z.number().min(0), amount: z.number().int().min(0) })).default([]),
    tasksOnTime: z.object({ pct: z.number().min(0).max(100), amount: z.number().int().min(0) }).optional(),
  }).optional(),
  allowances: z.object({
    weekendDay: z.number().int().min(0).default(0),
    overtimeHour: z.number().int().min(0).default(0),
    normHours: z.number().min(1).max(24).default(8),
  }).optional(),
});
export type PaySchemeComponents = z.infer<typeof paySchemeSchema>;

export type PeriodKind = "month" | "half" | "week";
export type Period = { key: string; kind: PeriodKind; start: string; end: string; label: string };

/** Строка продаж для расчёта процента (по позиции отгрузки или возврата) */
export type SaleLine = {
  shipmentId: number;
  shipmentNumber: number;
  orderId: number | null;
  orderNumber: number | null;
  kind: "shipment" | "return";
  date: string;
  /** Дата оплаты заявки (если оплачена) */
  paidDate: string | null;
  productId: number;
  folderId: number | null;
  managerId: number | null;
  segment: string;
  revenue: number; // тиын (qty*price), для возврата — положительное число
  cost: number;
};

export type AssemblyRecord = { orderId: number; orderNumber: number; date: string; items: number; units: number };
export type TimesheetEntry = { date: string; status: "present" | "absent" | "vacation" | "sick" | "dayoff"; hours: number };
export type AccrualRow = {
  id: number; orderId: number; orderNumber: number; clientName: string; authorName: string;
  baseAmount: number; rateBp: number; amount: number; status: string; kind: string; date: string; ruleName: string;
  /** Учитывается в расчёте (для правил «при отгрузке/оплате» — только подтверждённые) */
  counted: boolean;
};
export type AdjustmentRow = { id: number; date: string; type: "bonus" | "penalty" | "expense" | "weekend" | "overtime"; amount: number; hours: number | null; comment: string };
export type MoneyRow = { id: number; date: string; amount: number; comment: string };

export type PayslipInput = {
  period: Period;
  /** Схемы, действующие в периоде (отсортированы по validFrom). Последняя до начала периода тоже включается. */
  schemes: { validFrom: string; components: PaySchemeComponents }[];
  userId: number;
  timesheet: TimesheetEntry[];
  sales: SaleLine[];
  assemblies: AssemblyRecord[];
  accruals: AccrualRow[];
  adjustments: AdjustmentRow[];
  advances: MoneyRow[];
  payouts: MoneyRow[];
  /** Перенос с прошлого периода (отрицательный остаток) */
  carryIn: number;
  plan: number; // план продаж на период, тиын
  tasks: { total: number; onTime: number };
};

export type DetailRow = { label: string; amount?: number; ref?: string; note?: string };
export type PayslipLine = {
  code: "salary" | "sales" | "accruals" | "piecework" | "bonus" | "allowance" | "penalty" | "expense";
  label: string;
  amount: number;
  details: DetailRow[];
};
export type Payslip = {
  userId: number;
  period: Period;
  lines: PayslipLine[];
  accrued: number;
  advances: number;
  payouts: number;
  carryIn: number;
  /** К выплате (может быть отрицательным — переносится) */
  toPay: number;
  balanceAfterPayouts: number;
  planProgressPct: number;
  nextTier: { atPct: number; rateBp: number; remaining: number } | null;
  notes: string[];
};
