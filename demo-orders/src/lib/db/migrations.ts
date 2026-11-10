import fs from "fs";
import path from "path";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import {
  ATELIER_COMPANY_ID,
  purgeDemoData,
  removeUploadDirs,
} from "@/lib/services/demo-cleanup";
import { ensureExpenseCategories } from "@/lib/services/order-expenses";
import { COMPANY_3_ID } from "@/lib/company";
import { buildFurniturePriceItems } from "./furniture-seed";
import {
  LEGACY_ATELIER_STATUS_MAP,
  type AppData,
  type LegacyAtelierOrderStatus,
  type UserRole,
} from "@/types";

type Migration = {
  id: string;
  /** Returns true when data changed. */
  run: (data: AppData, after: (fn: () => void) => void) => boolean;
};

type StaffSeed = {
  login: string;
  fullName: string;
  firstName: string;
  role: UserRole;
  position: string;
  passwordHash: string;
};

export function ensureProductionAdmin(_data: AppData): boolean {
  return false;
}

export function addAtelierStaff(data: AppData): boolean {
  if (!data.companies.some((c) => c.id === ATELIER_COMPANY_ID)) return false;
  let changed = false;
  for (const seed of [] as StaffSeed[]) {
    if (data.users.some((u) => u.login?.toLowerCase() === seed.login)) continue;
    const employeeId = generateId("emp");
    data.employees.push({
      id: employeeId,
      companyId: ATELIER_COMPANY_ID,
      fullName: seed.fullName,
      firstName: seed.firstName,
      phone: "",
      position: seed.position,
      role: seed.role,
      status: "active",
      hireDate: todayDate(),
      compensationType: "fixed",
      percentage: null,
      fixedSalary: null,
      photoUrl: null,
      isMeasurer: false,
    });
    data.users.push({
      id: generateId("user"),
      companyId: ATELIER_COMPANY_ID,
      email: "",
      login: seed.login,
      passwordHash: seed.passwordHash,
      fullName: seed.fullName,
      firstName: seed.firstName,
      role: seed.role,
      employeeId,
      avatarUrl: null,
      isActive: true,
      access: null,
    });
    changed = true;
  }
  return changed;
}

export function migrateAtelierStatuses(data: AppData): boolean {
  let changed = false;
  const textiles = new Set(
    data.companies.filter((c) => c.vertical === "textiles").map((c) => c.id),
  );
  for (const order of data.orders) {
    if (!textiles.has(order.companyId)) continue;
    const mapped = LEGACY_ATELIER_STATUS_MAP[order.status as LegacyAtelierOrderStatus];
    if (mapped) {
      order.status = mapped;
      changed = true;
    }
    if (!order.statusHistory) {
      order.statusHistory = [
        {
          status: order.status,
          from: null,
          at: order.createdAt || nowIso(),
          actorId: null,
          actorName: "Система",
        },
      ];
      changed = true;
    }
  }
  return changed;
}

const MIGRATIONS: Migration[] = [
  { id: "2026-11-activate-companies-4-6", run: (data) => {
    data.furniturePriceItems ??= [];
    for (const n of [4, 5, 6]) {
      const id = `company_00${n}`;
      let company = data.companies.find((c) => c.id === id);
      if (!company) { company = { id, name: `Компания ${n}`, tagline: "мебель на заказ", status: "active", currency: "KZT", timezone: "Asia/Almaty", vertical: "furniture" }; data.companies.push(company); }
      else { company.status = "active"; company.vertical = "furniture"; if (company.tagline === "скоро") company.tagline = "мебель на заказ"; }
      if (!data.furniturePriceItems.some((p) => p.companyId === id)) data.furniturePriceItems.push(...buildFurniturePriceItems(id));
    }
    return true;
  } },
  {
    id: "2026-10-atelier-purge-demo",
    run: (data, after) => {
      const { report, uploadDirs } = purgeDemoData(data, ATELIER_COMPANY_ID, {
        byName: false,
      });
      after(() => removeUploadDirs(uploadDirs));
      return (
        report.users.length + report.clients.length + report.orders.length + report.employees.length >
          0 || report.notifications + report.tasks + report.activity + report.proposals > 0
      );
    },
  },
  { id: "2026-10-atelier-statuses", run: (data) => migrateAtelierStatuses(data) },
  { id: "2026-10-atelier-staff", run: (data) => addAtelierStaff(data) },
  { id: "2026-10-activate-company-3", run: (data) => activateCompany3(data) },
  { id: "2026-10-production-admin", run: (data) => ensureProductionAdmin(data) },
];

export function activateCompany3(data: AppData): boolean {
  const company = data.companies.find((c) => c.id === COMPANY_3_ID);
  if (!company) {
    data.companies.push({
      id: COMPANY_3_ID,
      name: "Компания 3",
      tagline: "ремонт и строительство",
      status: "active",
      currency: "KZT",
      timezone: "Asia/Almaty",
      vertical: "furniture",
      phone: "+7 (727) 000-00-03",
      email: "hello@example.com",
      address: "Алматы",
    });
    return true;
  }
  let changed = false;
  if (company.status !== "active") {
    company.status = "active";
    changed = true;
  }
  if (company.tagline === "скоро" || !company.tagline) {
    company.tagline = "ремонт и строительство";
    changed = true;
  }
  if (company.name !== "Компания 3") {
    company.name = "Компания 3";
    changed = true;
  }
  if (!company.phone) {
    company.phone = "+7 (727) 000-00-03";
    changed = true;
  }
  if (!company.email) {
    company.email = "hello@example.com";
    changed = true;
  }
  if (!company.address) {
    company.address = "Алматы";
    changed = true;
  }
  if (!data.settings.some((s) => s.companyId === COMPANY_3_ID)) {
    data.settings.push({
      companyId: COMPANY_3_ID,
      workStart: "09:00",
      workEnd: "18:00",
      workDays: [1, 2, 3, 4, 5, 6],
      lateThresholdMinutes: 0,
      latePenaltyAmount: 20000,
      advanceMaxPercent: 30,
      defaultAssemblerPercent: 15,
      qrRotateSeconds: 60,
    });
    changed = true;
  }
  return changed;
}

export function backupDataFile(dataFile: string, prefix = "mebeldemo"): string | null {
  if (!fs.existsSync(dataFile)) return null;
  const dir = path.join(path.dirname(dataFile), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `${prefix}-${stamp}.json`);
  fs.copyFileSync(dataFile, target);
  return target;
}

/**
 * Applies pending one-time migrations and recurring structure fixes.
 * The data file is copied to data/backups before the first pending migration changes it.
 * Returns callbacks to run after the data is saved.
 */
export function runMigrations(
  data: AppData,
  dataFile: string,
): { changed: boolean; afterSave: (() => void)[] } {
  const afterSave: (() => void)[] = [];
  let changed = false;
  if (!data.migrations) data.migrations = [];
  const pending = MIGRATIONS.filter((m) => !data.migrations.includes(m.id));
  if (pending.length > 0) {
    backupDataFile(dataFile);
    for (const m of pending) {
      m.run(data, (fn) => afterSave.push(fn));
      data.migrations.push(m.id);
      changed = true;
    }
  }
  if (ensureExpenseCategories(data)) changed = true;
  return { changed, afterSave };
}
