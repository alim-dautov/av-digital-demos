/**
 * Движок расчёта зарплаты. Чистая функция без обращений к БД: на вход — данные периода,
 * на выход — расчётный лист с детализацией «из чего сложилась сумма».
 * Все суммы — тиыны, округление до целых тенге.
 */
import { addDays, bp, daysBetween, fmtDate, money, monthRange, roundTenge, weekday } from "@/lib/format";
import type { DetailRow, PayslipInput, Payslip, PayslipLine, PaySchemeComponents, SaleLine, Period } from "./types";

type Seg = { start: string; end: string; scheme: PaySchemeComponents; validFrom: string };

/** Рабочие дни (Пн–Пт или Пн–Сб) в диапазоне включительно */
export function workDays(start: string, end: string, workWeek: 5 | 6): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 0) continue;
    if (wd === 6 && workWeek === 5) continue;
    n++;
  }
  return n;
}

const inRange = (d: string | null, s: string, e: string) => !!d && d >= s && d <= e;

/** Разбиение периода по схемам, действующим в нём */
export function segments(period: Period, schemes: PayslipInput["schemes"]): Seg[] {
  const sorted = [...schemes].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const res: Seg[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const next = sorted[i + 1];
    const segStart = s.validFrom > period.start ? s.validFrom : period.start;
    const segEnd = next ? (addDays(next.validFrom, -1) < period.end ? addDays(next.validFrom, -1) : period.end) : period.end;
    if (segStart > period.end || segEnd < period.start || segStart > segEnd) continue;
    res.push({ start: segStart, end: segEnd, scheme: s.components, validFrom: s.validFrom });
  }
  return res;
}

/** Ставка по шкале. whole — ставка достигнутой ступени ко всей базе; marginal — по частям. */
export function tierRate(tiers: { fromPlanPct: number; rateBp: number }[], progressPct: number, mode: "whole" | "marginal"): number {
  const t = [...tiers].sort((a, b) => a.fromPlanPct - b.fromPlanPct);
  if (t.length === 0) return 0;
  if (mode === "whole" || progressPct <= 0) {
    let r = t[0].rateBp;
    for (const x of t) if (progressPct >= x.fromPlanPct) r = x.rateBp;
    return r;
  }
  // marginal: средневзвешенная ставка по долям выполнения плана
  let weighted = 0;
  for (let i = 0; i < t.length; i++) {
    const from = t[i].fromPlanPct;
    const to = i + 1 < t.length ? t[i + 1].fromPlanPct : Infinity;
    const share = Math.max(0, Math.min(progressPct, to) - from);
    weighted += share * t[i].rateBp;
  }
  return weighted / progressPct;
}

function salesFor(lines: SaleLine[], userId: number, sp: NonNullable<PaySchemeComponents["salesPercent"]>, s: string, e: string) {
  return lines.filter((l) => {
    if (sp.scope === "own" && l.managerId !== userId) return false;
    if (sp.scope === "segment" && sp.segment && l.segment !== sp.segment) return false;
    if (sp.excludeProductIds.includes(l.productId)) return false;
    if (l.folderId != null && sp.excludeFolderIds.includes(l.folderId)) return false;
    if (l.kind === "return") return sp.countReturns && inRange(l.date, s, e);
    if (sp.skipNonPositiveMargin && l.revenue - l.cost <= 0) return false;
    return sp.trigger === "paid" ? inRange(l.paidDate, s, e) : inRange(l.date, s, e);
  });
}

export function computePayslip(input: PayslipInput): Payslip {
  const { period, userId } = input;
  const notes: string[] = [];
  const segs = segments(period, input.schemes);
  const multi = segs.length > 1;
  const segLabel = (sg: Seg) => (multi ? ` (схема с ${fmtDate(sg.validFrom)})` : "");
  if (segs.length === 0) notes.push("Схема оплаты не задана — начисляются только правила по заявкам, бонусы и штрафы.");

  const lines: PayslipLine[] = [];
  const add = (code: PayslipLine["code"], label: string, amount: number, details: DetailRow[]) => {
    const ex = lines.find((l) => l.code === code);
    if (ex) { ex.amount += amount; ex.details.push(...details); }
    else lines.push({ code, label, amount, details });
  };

  const month = monthRange(period.start);
  const presentDays = new Set(input.timesheet.filter((t) => t.status === "present").map((t) => t.date));
  const hasTimesheet = input.timesheet.length > 0;

  // ── Прогресс плана (выручка за весь период по своим продажам) ──
  const ownRevenue = input.sales
    .filter((l) => l.managerId === userId && inRange(l.date, period.start, period.end))
    .reduce((s, l) => s + (l.kind === "return" ? -l.revenue : l.revenue), 0);
  const planProgressPct = input.plan > 0 ? (ownRevenue / input.plan) * 100 : 0;

  for (const sg of segs) {
    const sc = sg.scheme;

    // ── Оклад ──
    if (sc.salary && sc.salary.amount > 0) {
      const ww = sc.salary.workWeek ?? 6;
      const normMonth = workDays(month.start, month.end, ww);
      const normSeg = workDays(sg.start, sg.end, ww);
      let days = normSeg;
      const det: DetailRow[] = [];
      if (sc.salary.prorate) {
        if (hasTimesheet) {
          days = 0;
          for (let d = sg.start; d <= sg.end; d = addDays(d, 1)) if (presentDays.has(d)) days++;
          days = Math.min(days, normSeg);
        } else {
          notes.push("Табель за период не заполнен — оклад начислен за все рабочие дни.");
        }
      }
      const amount = roundTenge(normMonth ? (sc.salary.amount * days) / normMonth : 0);
      det.push({ label: `Оклад ${money(sc.salary.amount)} / мес, норма ${normMonth} раб. дн.${segLabel(sg)}`, note: `${sc.salary.prorate ? "отработано" : "оплачивается"} ${days} из ${normSeg} дн.`, amount });
      add("salary", "Оклад", amount, det);
    }

    // ── Процент от продаж ──
    const sp = sc.salesPercent;
    if (sp) {
      const rel = salesFor(input.sales, userId, sp, sg.start, sg.end);
      const rateBp = input.plan > 0 ? tierRate(sp.tiers, planProgressPct, sp.tierMode) : [...sp.tiers].sort((a, b) => a.fromPlanPct - b.fromPlanPct)[0].rateBp;
      const byShipment = new Map<number, { label: string; base: number }>();
      let base = 0;
      for (const l of rel) {
        const v = sp.basis === "profit" ? l.revenue - l.cost : l.revenue;
        const signed = l.kind === "return" ? -v : v;
        base += signed;
        const key = l.shipmentId;
        const lbl = `${l.kind === "return" ? "Возврат" : "Отгрузка"} №${l.shipmentNumber}${l.orderNumber ? ` (заявка №${l.orderNumber})` : ""} от ${fmtDate(l.date)}`;
        const cur = byShipment.get(key) ?? { label: lbl, base: 0 };
        cur.base += signed;
        byShipment.set(key, cur);
      }
      const amount = roundTenge((base * rateBp) / 10000);
      const det: DetailRow[] = [{
        label: `База: ${sp.basis === "profit" ? "прибыль" : "выручка"} ${money(base)} × ${bp(Math.round(rateBp))}${segLabel(sg)}`,
        note: `${sp.trigger === "paid" ? "по оплаченным" : "по отгрузкам"}, ${sp.scope === "own" ? "свои заявки" : sp.scope === "segment" ? "сегмент" : "весь отдел"}${input.plan > 0 ? `, план выполнен на ${planProgressPct.toFixed(1)}%` : ""}`,
        amount,
      }];
      for (const [id, v] of byShipment) det.push({ label: v.label, amount: roundTenge((v.base * rateBp) / 10000), ref: `/shipments/${id}`, note: `база ${money(v.base)}` });
      add("sales", "Процент от продаж", amount, det);
    }

    // ── Сдельная ──
    const pw = sc.piecework;
    if (pw) {
      const recs = input.assemblies.filter((a) => inRange(a.date, sg.start, sg.end));
      const perDay = new Map<string, number>();
      const det: DetailRow[] = [];
      for (const a of recs) {
        const units = pw.per === "order" ? 1 : pw.per === "item" ? a.items : a.units;
        const v = units * pw.rate;
        perDay.set(a.date, (perDay.get(a.date) ?? 0) + v);
        det.push({ label: `Сборка заявки №${a.orderNumber} от ${fmtDate(a.date)}`, note: pw.per === "order" ? "1 заявка" : `${units} ${pw.per === "item" ? "поз." : "ед."}`, amount: v, ref: `/orders/${a.orderId}` });
      }
      let total = 0;
      const days = new Set([...perDay.keys(), ...[...presentDays].filter((d) => inRange(d, sg.start, sg.end))]);
      let minApplied = 0;
      for (const d of days) {
        const v = perDay.get(d) ?? 0;
        if (pw.minPerShift > 0 && presentDays.has(d) && v < pw.minPerShift) { total += pw.minPerShift; minApplied++; }
        else total += v;
      }
      total = roundTenge(total);
      if (minApplied) det.unshift({ label: `Минимум за смену ${money(pw.minPerShift)} применён к ${minApplied} дн.` });
      det.unshift({ label: `Ставка ${money(pw.rate)} за ${pw.per === "order" ? "заявку" : pw.per === "item" ? "позицию" : "единицу"}${segLabel(sg)}`, amount: total });
      add("piecework", "Сдельная оплата", total, det);
    }

    // ── Надбавки из табеля ──
    const al = sc.allowances;
    if (al && (al.weekendDay > 0 || al.overtimeHour > 0)) {
      const ww = sc.salary?.workWeek ?? 6;
      const det: DetailRow[] = [];
      let total = 0;
      for (const t of input.timesheet) {
        if (t.status !== "present" || !inRange(t.date, sg.start, sg.end)) continue;
        const wd = weekday(t.date);
        const weekend = wd === 0 || (wd === 6 && ww === 5);
        if (weekend && al.weekendDay > 0) { total += al.weekendDay; det.push({ label: `Выход в выходной ${fmtDate(t.date)}`, amount: al.weekendDay }); }
        const ot = Math.max(0, t.hours - (al.normHours ?? 8));
        if (ot > 0 && al.overtimeHour > 0) { const v = Math.round(ot * al.overtimeHour); total += v; det.push({ label: `Сверхурочно ${fmtDate(t.date)}: ${ot} ч`, amount: v }); }
      }
      if (total) add("allowance", "Надбавки", roundTenge(total), det);
    }
  }

  // ── Начисления по правилам автора заявки ──
  const acc = input.accruals.filter((a) => a.status !== "cancelled" && inRange(a.date, period.start, period.end));
  if (acc.length) {
    let total = 0;
    const det: DetailRow[] = [];
    for (const a of acc) {
      if (a.counted) total += a.amount;
      det.push({
        label: `${a.kind.startsWith("main") ? "Заявка" : "Возврат по заявке"} №${a.orderNumber} · ${a.clientName}${a.kind.endsWith(":co") ? " (вдвоём, половина)" : ""}`,
        note: `${a.ruleName}: ${money(a.baseAmount)} × ${bp(a.rateBp)}, автор ${a.authorName}${a.counted ? "" : " — ожидает подтверждения"}`,
        amount: a.amount,
        ref: `/orders/${a.orderId}`,
      });
    }
    add("accruals", "Начисления по заявкам", roundTenge(total), det);
  }

  // ── KPI-бонусы ──
  const last = segs[segs.length - 1]?.scheme;
  if (last?.kpiBonus) {
    const kb = last.kpiBonus;
    const det: DetailRow[] = [];
    let total = 0;
    const reached = [...kb.planThresholds].sort((a, b) => a.pct - b.pct).filter((t) => planProgressPct >= t.pct).pop();
    if (reached && input.plan > 0) { total += reached.amount; det.push({ label: `План продаж выполнен на ${planProgressPct.toFixed(1)}% (порог ${reached.pct}%)`, amount: reached.amount }); }
    if (kb.tasksOnTime && input.tasks.total > 0) {
      const p = (input.tasks.onTime / input.tasks.total) * 100;
      if (p >= kb.tasksOnTime.pct) { total += kb.tasksOnTime.amount; det.push({ label: `Задачи в срок: ${p.toFixed(0)}% (${input.tasks.onTime} из ${input.tasks.total}), порог ${kb.tasksOnTime.pct}%`, amount: kb.tasksOnTime.amount }); }
      else det.push({ label: `Задачи в срок: ${p.toFixed(0)}% — ниже порога ${kb.tasksOnTime.pct}%`, amount: 0 });
    }
    if (det.length) add("bonus", "Бонусы", total, det);
  }

  // ── Ручные бонусы, надбавки, штрафы ──
  for (const a of input.adjustments.filter((x) => inRange(x.date, period.start, period.end))) {
    const minus = a.type === "penalty" || a.type === "expense";
    const row: DetailRow = { label: `${fmtDate(a.date)} — ${a.comment || "без комментария"}`, amount: minus ? -Math.abs(a.amount) : a.amount };
    if (a.type === "bonus") add("bonus", "Бонусы", a.amount, [row]);
    else if (a.type === "penalty") add("penalty", "Штрафы и удержания", -Math.abs(a.amount), [row]);
    else if (a.type === "expense") add("expense", "Расходы сотрудника", -Math.abs(a.amount), [row]);
    else add("allowance", "Надбавки", a.amount, [{ ...row, label: `${a.type === "weekend" ? "Выход в выходной" : `Сверхурочные${a.hours ? ` ${a.hours} ч` : ""}`}: ${row.label}` }]);
  }

  const order: PayslipLine["code"][] = ["salary", "sales", "accruals", "piecework", "bonus", "allowance", "penalty", "expense"];
  lines.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));

  const accrued = lines.reduce((s, l) => s + l.amount, 0);
  const advances = input.advances.reduce((s, a) => s + a.amount, 0);
  const payouts = input.payouts.reduce((s, a) => s + a.amount, 0);
  const toPay = accrued + input.carryIn - advances;
  const balanceAfterPayouts = toPay - payouts;
  if (input.carryIn < 0) notes.push(`Перенос долга с прошлого периода: ${money(input.carryIn)}.`);
  if (input.carryIn > 0) notes.push(`Невыплаченный остаток прошлого периода: ${money(input.carryIn)}.`);
  if (toPay < 0) notes.push(`Аванс превышает начисленное: отрицательный остаток ${money(toPay)} перейдёт на следующий период.`);

  // ── Следующая ступень бонуса ──
  let nextTier: Payslip["nextTier"] = null;
  const tiers = last?.salesPercent?.tiers ?? [];
  if (input.plan > 0) {
    const nt = [...tiers].sort((a, b) => a.fromPlanPct - b.fromPlanPct).find((t) => t.fromPlanPct > planProgressPct);
    if (nt) nextTier = { atPct: nt.fromPlanPct, rateBp: nt.rateBp, remaining: Math.max(0, Math.round((input.plan * nt.fromPlanPct) / 100 - ownRevenue)) };
  }

  void daysBetween;
  return { userId, period, lines, accrued, advances, payouts, carryIn: input.carryIn, toPay, balanceAfterPayouts, planProgressPct, nextTier, notes };
}

/** Ключи периодов: 2026-11 (месяц), 2026-11-H1/H2 (полумесяц), 2026-W45 (неделя) */
export function periodFromKey(key: string): Period {
  const mm = /^(\d{4})-(\d{2})$/.exec(key);
  const MONTHS_GEN = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  if (mm) {
    const r = monthRange(`${key}-01`);
    return { key, kind: "month", ...r, label: `${MONTHS_GEN[Number(mm[2]) - 1]} ${mm[1]}` };
  }
  const hm = /^(\d{4})-(\d{2})-H([12])$/.exec(key);
  if (hm) {
    const r = monthRange(`${hm[1]}-${hm[2]}-01`);
    const start = hm[3] === "1" ? r.start : `${hm[1]}-${hm[2]}-16`;
    const end = hm[3] === "1" ? `${hm[1]}-${hm[2]}-15` : r.end;
    return { key, kind: "half", start, end, label: `${hm[3] === "1" ? "1–15" : "16–" + r.end.slice(8)} ${MONTHS_GEN[Number(hm[2]) - 1]} ${hm[1]}` };
  }
  const wm = /^(\d{4})-W(\d{2})$/.exec(key);
  if (wm) {
    // ISO-неделя
    const y = Number(wm[1]), w = Number(wm[2]);
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const wd = jan4.getUTCDay() || 7;
    const monday = new Date(jan4.getTime() - (wd - 1) * 86400000 + (w - 1) * 7 * 86400000).toISOString().slice(0, 10);
    return { key, kind: "week", start: monday, end: addDays(monday, 6), label: `неделя ${w}, ${fmtDate(monday)}–${fmtDate(addDays(monday, 6))}` };
  }
  throw new Error("Неверный ключ периода: " + key);
}

export function isoWeekKey(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wd);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

/** План на период из недельного плана */
export function planForPeriod(weeklyPlan: number, p: Period) {
  const days = daysBetween(p.start, p.end) + 1;
  return Math.round((weeklyPlan * days) / 7);
}
