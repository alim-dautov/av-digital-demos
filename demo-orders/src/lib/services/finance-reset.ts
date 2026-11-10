import { backupDataFile } from "@/lib/db/migrations";
import { getData, getDataPath, mutateDataLocked } from "@/lib/db";
import { generateId, nowIso } from "@/lib/utils";
import type { AppData, UserRole } from "@/types";
import {
  FINANCE_CATEGORIES,
  FINANCE_CATEGORY_LABELS,
  type FinanceCategory,
  type FinanceCounts,
} from "@/lib/domain/finance-categories";

export { FINANCE_CATEGORIES, FINANCE_CATEGORY_LABELS, type FinanceCategory, type FinanceCounts };

/**
 * «Удалить все финансовые данные» for one company. Only money ledgers are touched:
 * users, employees, clients, orders, price lists, materials, settings and the gallery stay.
 */
export class FinanceResetError extends Error {}

/** Only the owner and the administrator may wipe finance data. */
export function canResetFinance(subject: { role: UserRole }): boolean {
  return subject.role === "OWNER" || subject.role === "ADMIN";
}

function own<T extends { companyId: string }>(rows: T[], companyId: string) {
  return rows.filter((r) => r.companyId === companyId);
}

export function countFinanceData(data: AppData, companyId: string): FinanceCounts {
  const orders = own(data.orders, companyId);
  return {
    payments: orders.reduce(
      (n, o) => n + (o.payments?.length ?? 0) + ((o.prepayment ?? 0) > 0 ? 1 : 0),
      0,
    ),
    cash: own(data.cashEntries, companyId).length,
    purchases: own(data.purchases, companyId).length,
    orderExpenses: own(data.orderExpenses, companyId).length,
    payroll:
      own(data.salaries, companyId).length +
      own(data.salaryPayments, companyId).length +
      own(data.advances, companyId).length +
      own(data.penalties, companyId).length,
  };
}

export function getFinanceCounts(companyId: string): FinanceCounts {
  return countFinanceData(getData(), companyId);
}

/** Pure part, so it can be tested on plain data. Returns what was removed. */
export function wipeFinanceData(
  data: AppData,
  companyId: string,
  categories: FinanceCategory[],
): FinanceCounts {
  const on = new Set(categories);
  const removed = countFinanceData(data, companyId);
  for (const key of FINANCE_CATEGORIES) if (!on.has(key)) removed[key] = 0;
  const other = <T extends { companyId: string }>(r: T) => r.companyId !== companyId;

  if (on.has("payments")) {
    for (const o of data.orders) {
      if (o.companyId !== companyId) continue;
      o.prepayment = 0;
      o.payments = [];
    }
  }
  if (on.has("cash")) {
    data.cashEntries = data.cashEntries.filter(other);
  } else {
    // Cash rows created by deleted payments or purchases would be orphans: drop them too.
    data.cashEntries = data.cashEntries.filter(
      (c) =>
        other(c) ||
        !(
          (on.has("payments") && (c.source === "payment" || c.source === "prepayment")) ||
          (on.has("purchases") && c.source === "purchase")
        ),
    );
  }
  if (on.has("purchases")) data.purchases = data.purchases.filter(other);
  if (on.has("orderExpenses")) data.orderExpenses = data.orderExpenses.filter(other);
  if (on.has("payroll")) {
    data.salaries = data.salaries.filter(other);
    data.salaryPayments = data.salaryPayments.filter(other);
    data.advances = data.advances.filter(other);
    data.penalties = data.penalties.filter(other);
  }
  return removed;
}

/**
 * Copies data/mebeldemo.json to data/backups/pre-finance-reset-<time>.json inside the write lock,
 * then deletes. The store saves through a temp file and rename, so the write is atomic.
 */
export function resetFinanceData(
  companyId: string,
  categories: FinanceCategory[],
  actor: { id: string; name: string },
): { removed: FinanceCounts; backup: string } {
  if (categories.length === 0) throw new FinanceResetError("Выберите, что удалить");
  return mutateDataLocked((data) => {
    const backup = backupDataFile(getDataPath(), "pre-finance-reset");
    if (!backup) throw new FinanceResetError("Не удалось сделать резервную копию, ничего не удалено");
    const removed = wipeFinanceData(data, companyId, categories);
    const parts = categories.map((c) => `${FINANCE_CATEGORY_LABELS[c]}: ${removed[c]}`);
    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Удалил финансовые данные (${parts.join("; ")}). Копия: ${backup.split("/").pop()}`,
      entityType: "settings",
      entityId: companyId,
      createdAt: nowIso(),
    });
    return { removed, backup };
  });
}
