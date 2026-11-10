import { randomBytes } from "crypto";
import { getData, mutateData, mutateDataLocked } from "@/lib/db";
import {
  calcLateMinutes,
  calcLatePenalty,
} from "@/lib/domain/calculations";
import { generateId, todayDate } from "@/lib/utils";
import { getSettings } from "@/lib/services/settings";
import { logActivity } from "@/lib/services/activity";
import type { Attendance, AttendanceQR } from "@/types";

function makeToken(): string {
  return `TAV-QR-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function isUnexpired(qr: AttendanceQR, now = new Date()): boolean {
  return new Date(qr.expiresAt).getTime() > now.getTime();
}

export function getActiveQr(companyId: string): AttendanceQR | null {
  const now = new Date();
  const active = getData().attendanceQr.find(
    (q) =>
      q.companyId === companyId &&
      q.usedAt === null &&
      isUnexpired(q, now),
  );
  return active ?? null;
}

export function rotateQr(companyId: string): AttendanceQR {
  const settings = getSettings(companyId);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + settings.qrRotateSeconds * 1000,
  ).toISOString();

  let created: AttendanceQR | null = null;
  mutateData((data) => {
    for (const q of data.attendanceQr) {
      if (q.companyId === companyId && q.usedAt === null) {
        q.expiresAt = now.toISOString();
      }
    }
    created = {
      id: generateId("qr"),
      companyId,
      token: makeToken(),
      expiresAt,
      usedAt: null,
      employeeId: null,
      location: "Цех Mebel Demo, Алматы",
      createdAt: now.toISOString(),
    };
    data.attendanceQr.push(created);
  });
  return created!;
}

export function scanQr(
  companyId: string,
  token: string,
  employeeId: string,
): {
  checkInAt: string;
  lateMinutes: number;
  penaltyAmount: number;
  attendance: Attendance;
} {
  const now = new Date();
  const checkInAt = now.toISOString();
  const today = todayDate();
  let attendance: Attendance | null = null;
  let employeeName = "";
  let lateMinutes = 0;
  let penaltyAmount = 0;

  // The duplicate check and token consumption must be atomic: two browser tabs
  // must not turn one employee's arrival into two attendance records.
  mutateDataLocked((data) => {
    const settings = getSettings(companyId);
    const employee = data.employees.find(
      (e) => e.id === employeeId && e.companyId === companyId,
    );
    if (!employee) throw new Error("Сотрудник не найден");
    employeeName = employee.fullName;

    if (!settings.workDays.includes(now.getDay())) {
      throw new Error("Сегодня нерабочий день по графику компании");
    }

    const existing = data.attendance.find(
      (row) =>
        row.companyId === companyId &&
        row.employeeId === employeeId &&
        row.date === today,
    );
    if (existing) {
      throw new Error("Вы уже отметили приход сегодня");
    }

    const qrRow = data.attendanceQr.find(
      (q) =>
        q.companyId === companyId &&
        q.token === token &&
        q.usedAt === null &&
        isUnexpired(q, now),
    );
    if (!qrRow) throw new Error("QR-код недействителен или уже использован");

    lateMinutes = calcLateMinutes(
      now.getHours(),
      now.getMinutes(),
      settings.workStart,
      settings.lateThresholdMinutes,
    );
    penaltyAmount = calcLatePenalty(lateMinutes, settings.latePenaltyAmount);

    qrRow.usedAt = checkInAt;
    qrRow.employeeId = employeeId;

    attendance = {
      id: generateId("att"),
      companyId,
      employeeId,
      date: today,
      checkInAt,
      lateMinutes,
      penaltyAmount,
      qrTokenId: qrRow.id,
      location: qrRow.location,
    };
    data.attendance.push(attendance);

    if (penaltyAmount > 0) {
      data.penalties.push({
        id: generateId("pen"),
        companyId,
        employeeId,
        reason: `Опоздание на ${lateMinutes} мин (приход ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")})`,
        amount: penaltyAmount,
        date: today,
        comment: "Автоштраф по правилам компании",
        authorId: "system",
        status: "active",
        auto: true,
      });
    }

    // Expire leftover unused tokens, then issue a fresh one
    for (const q of data.attendanceQr) {
      if (q.companyId === companyId && q.usedAt === null && q.id !== qrRow.id) {
        q.expiresAt = checkInAt;
      }
    }
    const expiresAt = new Date(
      now.getTime() + settings.qrRotateSeconds * 1000,
    ).toISOString();
    data.attendanceQr.push({
      id: generateId("qr"),
      companyId,
      token: makeToken(),
      expiresAt,
      usedAt: null,
      employeeId: null,
      location: qrRow.location,
      createdAt: checkInAt,
    });
  });

  logActivity({
    companyId,
    actorId: employeeId,
    actorName: employeeName,
    action:
      lateMinutes > 0
        ? `Отметил приход с опозданием ${lateMinutes} мин (−${penaltyAmount} ₸)`
        : "Отметил приход по QR",
    entityType: "attendance",
    entityId: attendance!.id,
  });

  return {
    checkInAt,
    lateMinutes,
    penaltyAmount,
    attendance: attendance!,
  };
}

export function listAttendance(
  companyId: string,
  date?: string,
): Attendance[] {
  const day = date ?? todayDate();
  return getData()
    .attendance.filter((a) => a.companyId === companyId && a.date === day)
    .sort((a, b) => (a.checkInAt < b.checkInAt ? -1 : 1));
}

export function getLateToday(companyId: string): Array<
  Attendance & { employeeName: string }
> {
  const data = getData();
  return listAttendance(companyId)
    .filter((a) => a.lateMinutes > 0)
    .map((a) => ({
      ...a,
      employeeName:
        data.employees.find((e) => e.id === a.employeeId)?.fullName ??
        "Неизвестно",
    }));
}
