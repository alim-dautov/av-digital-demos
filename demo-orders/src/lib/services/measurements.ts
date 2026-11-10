import { getData, mutateData } from "@/lib/db";
import { generateId, nowIso, parseTimeToMinutes } from "@/lib/utils";
import { getSettings } from "@/lib/services/settings";
import type { Employee, Measurement, MeasurementStatus } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export class MeasurementConflictError extends Error {}

export type MeasurementInput = {
  clientId: string;
  orderId?: string | null;
  measurerId: string;
  date: string;
  startTime: string;
  durationMin: number;
  address?: string;
  status?: MeasurementStatus;
  comment?: string | null;
};

export function listMeasurers(companyId: string): Employee[] {
  return getData()
    .employees.filter(
      (e) => e.companyId === companyId && e.isMeasurer && e.status !== "fired",
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
}

export function listMeasurements(
  companyId: string,
  range?: { from: string; to: string },
): Measurement[] {
  return getData()
    .measurements.filter(
      (m) =>
        m.companyId === companyId &&
        (!range || (m.date >= range.from && m.date <= range.to)),
    )
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1,
    );
}

function overlaps(a: { startTime: string; durationMin: number }, b: typeof a) {
  const aStart = parseTimeToMinutes(a.startTime);
  const bStart = parseTimeToMinutes(b.startTime);
  return aStart < bStart + b.durationMin && bStart < aStart + a.durationMin;
}

function assertFree(all: Measurement[], candidate: Measurement) {
  if (candidate.status === "cancelled") return;
  const clash = all.find(
    (m) =>
      m.id !== candidate.id &&
      m.companyId === candidate.companyId &&
      m.measurerId === candidate.measurerId &&
      m.date === candidate.date &&
      m.status !== "cancelled" &&
      overlaps(m, candidate),
  );
  if (clash) {
    throw new MeasurementConflictError(
      `У замерщика уже есть замер в ${clash.startTime} на эту дату`,
    );
  }
}

function assertRefs(companyId: string, input: MeasurementInput) {
  const data = getData();
  const measurer = data.employees.find(
    (e) => e.id === input.measurerId && e.companyId === companyId,
  );
  if (!measurer?.isMeasurer) throw new Error("Замерщик не найден");
  const client = data.clients.find(
    (c) => c.id === input.clientId && c.companyId === companyId,
  );
  if (!client) throw new Error("Клиент не найден");
  if (input.orderId) {
    const order = data.orders.find(
      (o) => o.id === input.orderId && o.companyId === companyId && isActiveOrder(o),
    );
    if (!order || order.clientId !== client.id) {
      throw new Error("Заказ не относится к клиенту");
    }
  }
  return { client };
}

export function createMeasurement(companyId: string, input: MeasurementInput): Measurement {
  const { client } = assertRefs(companyId, input);
  let result!: Measurement;
  mutateData((data) => {
    const m: Measurement = {
      id: generateId("meas"),
      companyId,
      clientId: input.clientId,
      orderId: input.orderId ?? null,
      measurerId: input.measurerId,
      date: input.date,
      startTime: input.startTime,
      durationMin: input.durationMin,
      address: input.address?.trim() || client.address || "",
      status: input.status ?? "planned",
      comment: input.comment ?? null,
      createdAt: nowIso(),
    };
    assertFree(data.measurements, m);
    data.measurements.push(m);
    result = m;
  });
  return result;
}

export function updateMeasurement(
  companyId: string,
  id: string,
  patch: Partial<MeasurementInput>,
): Measurement {
  const current = getData().measurements.find(
    (m) => m.id === id && m.companyId === companyId,
  );
  if (!current) throw new Error("Замер не найден");
  const merged = { ...current, ...patch, orderId: patch.orderId ?? current.orderId };
  assertRefs(companyId, merged);
  let result!: Measurement;
  mutateData((data) => {
    const idx = data.measurements.findIndex((m) => m.id === id);
    const next: Measurement = { ...data.measurements[idx], ...merged };
    assertFree(data.measurements, next);
    data.measurements[idx] = next;
    result = next;
  });
  return result;
}

export function deleteMeasurement(companyId: string, id: string): void {
  mutateData((data) => {
    data.measurements = data.measurements.filter(
      (m) => !(m.id === id && m.companyId === companyId),
    );
  });
}

export function getWorkWindow(companyId: string) {
  const s = getSettings(companyId);
  return { workStart: s.workStart, workEnd: s.workEnd, workDays: s.workDays };
}

/** Share of working minutes booked per measurer over the given dates */
export function measurerLoad(
  companyId: string,
  dates: string[],
): Record<string, { bookedMin: number; capacityMin: number; count: number }> {
  const { workStart, workEnd, workDays } = getWorkWindow(companyId);
  const dayMinutes = Math.max(0, parseTimeToMinutes(workEnd) - parseTimeToMinutes(workStart));
  const workingDates = dates.filter((d) => {
    const dow = new Date(`${d}T00:00:00`).getDay() || 7;
    return workDays.includes(dow);
  });
  const set = new Set(dates);
  const out: Record<string, { bookedMin: number; capacityMin: number; count: number }> = {};
  for (const e of listMeasurers(companyId)) {
    out[e.id] = { bookedMin: 0, capacityMin: dayMinutes * workingDates.length, count: 0 };
  }
  for (const m of getData().measurements) {
    if (m.companyId !== companyId || m.status === "cancelled" || !set.has(m.date)) continue;
    const row = out[m.measurerId];
    if (!row) continue;
    row.bookedMin += m.durationMin;
    row.count += 1;
  }
  return out;
}

export function setEmployeeMeasurer(
  companyId: string,
  employeeId: string,
  isMeasurer: boolean,
): Employee {
  let result!: Employee;
  mutateData((data) => {
    const e = data.employees.find((x) => x.id === employeeId && x.companyId === companyId);
    if (!e) throw new Error("Сотрудник не найден");
    e.isMeasurer = isMeasurer;
    result = { ...e };
  });
  return result;
}
