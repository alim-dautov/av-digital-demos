import { getData, mutateData } from "@/lib/db";
import { normalizeAtelierQuote, recalcRoom } from "@/lib/domain/atelier-calc";
import { generateId, nowIso } from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS,
  type AppData,
  type ExpenseCategory,
  type Order,
  type OrderExpense,
  type AtelierStoredQuote,
} from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export const SYSTEM_EXPENSE_CATEGORIES = ["materials", "delivery", "labor", "other"] as const;

export class ExpenseError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** System categories exist for every textiles company. */
export function ensureExpenseCategories(data: AppData): boolean {
  if (!data.expenseCategories) data.expenseCategories = [];
  if (!data.orderExpenses) data.orderExpenses = [];
  let changed = false;
  for (const company of data.companies.filter((c) => c.vertical === "textiles")) {
    for (const key of SYSTEM_EXPENSE_CATEGORIES) {
      if (data.expenseCategories.some((c) => c.companyId === company.id && c.key === key)) continue;
      data.expenseCategories.push({
        id: generateId("expcat"),
        companyId: company.id,
        key,
        label: EXPENSE_CATEGORY_LABELS[key],
        system: true,
        createdAt: nowIso(),
      });
      changed = true;
    }
  }
  return changed;
}

export function listExpenseCategories(companyId: string): ExpenseCategory[] {
  const order = new Map<string, number>(SYSTEM_EXPENSE_CATEGORIES.map((k, i) => [k, i]));
  return getData()
    .expenseCategories.filter((c) => c.companyId === companyId)
    .sort(
      (a, b) =>
        (order.get(a.key) ?? 100) - (order.get(b.key) ?? 100) ||
        a.label.localeCompare(b.label, "ru"),
    );
}

export function addExpenseCategory(companyId: string, label: string): ExpenseCategory {
  const name = label.trim().replace(/\s+/g, " ");
  if (!name) throw new ExpenseError("Укажите название категории");
  let created!: ExpenseCategory;
  mutateData((data) => {
    if (
      data.expenseCategories.some(
        (c) => c.companyId === companyId && c.label.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new ExpenseError("Такая категория уже есть", 409);
    }
    created = {
      id: generateId("expcat"),
      companyId,
      key: generateId("cat"),
      label: name,
      system: false,
      createdAt: nowIso(),
    };
    data.expenseCategories.push(created);
  });
  return created;
}

export function deleteExpenseCategory(companyId: string, categoryId: string): void {
  mutateData((data) => {
    const cat = data.expenseCategories.find((c) => c.id === categoryId && c.companyId === companyId);
    if (!cat) throw new ExpenseError("Категория не найдена", 404);
    if (cat.system) throw new ExpenseError("Системную категорию удалить нельзя");
    if (data.orderExpenses.some((e) => e.companyId === companyId && e.category === cat.key)) {
      throw new ExpenseError("Категория используется в расходах", 409);
    }
    data.expenseCategories = data.expenseCategories.filter((c) => c.id !== categoryId);
  });
}

export type QuoteExpenseLine = {
  sourceKey: string;
  category: "materials" | "labor";
  name: string;
  amount: number;
};

/** Cost lines of a calculator quote, one per material or work item. */
export function buildQuoteExpenseLines(stored: AtelierStoredQuote): QuoteExpenseLine[] {
  const quote = normalizeAtelierQuote(stored);
  const sewingTitle = quote.labels?.["sewing.title"] ?? "Пошив";
  const tapeTitle = quote.labels?.["sewing.tape"] ?? "Тесьма";
  const lines: QuoteExpenseLine[] = [];
  const push = (
    sourceKey: string,
    category: QuoteExpenseLine["category"],
    name: string,
    amount: number,
  ) => {
    const value = Math.round(Number(amount) || 0);
    if (value > 0) lines.push({ sourceKey, category, name, amount: value });
  };

  for (const raw of quote.rooms) {
    const room = recalcRoom(raw);
    const where = room.name.trim() || "Комната";
    for (const [kind, label] of [
      ["tulle", "Тюль"],
      ["portiere", "Портьера"],
    ] as const) {
      for (const l of room[kind]) {
        const key = `${room.id}:${kind}:${l.id}`;
        const fabric = l.fabricName || label;
        push(`${key}:fabric`, "materials", `${label}: ${fabric} · ${where}`, l.lineCost);
        push(`${key}:sewing`, "labor", `${sewingTitle}: ${fabric} · ${where}`, l.sewing.cost);
        push(`${key}:tape`, "labor", `${tapeTitle}: ${fabric} · ${where}`, l.tape.cost);
        for (const e of l.extras) {
          push(`${key}:extra:${e.id}`, "materials", `${e.name || "Доп. материал"} · ${where}`, e.lineCost);
        }
        push(`${key}:install`, "labor", `Монтаж: ${fabric} · ${where}`, l.install.cost);
      }
    }
    for (const c of room.cornices) {
      push(`${room.id}:cornice:${c.id}`, "materials", `Карниз: ${c.label} · ${where}`, c.lineCost);
      push(`${room.id}:cornice:${c.id}:install`, "labor", `Монтаж карниза · ${where}`, c.install.cost);
    }
    for (const c of room.covers) {
      push(`${room.id}:cover:${c.id}`, "materials", `Покрывало · ${where}`, c.lineCost);
    }
    for (const p of room.pillows) {
      push(`${room.id}:pillow:${p.id}`, "materials", `Подушки × ${p.quantity} · ${where}`, p.lineCost);
    }
    for (const a of room.accessories) {
      push(`${room.id}:accessory:${a.id}`, "materials", `${a.label} × ${a.quantity} · ${where}`, a.lineCost);
    }
    for (const r of room.rollers) {
      push(`${room.id}:roller:${r.id}`, "materials", `Рулонная штора · ${where}`, r.lineCost);
      push(`${room.id}:roller:${r.id}:install`, "labor", `Монтаж рулонной шторы · ${where}`, r.install.cost);
    }
  }
  return lines;
}

export type SyncResult = { added: number; updated: number; removed: number; kept: number };

/**
 * Upserts calculator lines by `sourceKey`, so repeated syncs never duplicate them.
 * Lines edited by hand keep their actual amount; only the planned amount follows the quote.
 * The quote itself is never changed.
 */
export function syncExpensesInData(
  data: AppData,
  order: Order,
  actorId: string | null,
): SyncResult {
  const result: SyncResult = { added: 0, updated: 0, removed: 0, kept: 0 };
  if (!order.atelierQuote) return result;
  const lines = buildQuoteExpenseLines(order.atelierQuote);
  const calculatedAt = order.atelierQuote.calculatedAt ?? null;
  const now = nowIso();
  const existing = new Map(
    data.orderExpenses
      .filter((e) => e.orderId === order.id && e.source === "calculator" && e.sourceKey)
      .map((e) => [e.sourceKey!, e]),
  );
  const seen = new Set<string>();

  for (const line of lines) {
    seen.add(line.sourceKey);
    const e = existing.get(line.sourceKey);
    if (!e) {
      data.orderExpenses.push({
        id: generateId("exp"),
        companyId: order.companyId,
        orderId: order.id,
        category: line.category,
        name: line.name,
        amount: line.amount,
        plannedAmount: line.amount,
        note: null,
        source: "calculator",
        sourceKey: line.sourceKey,
        quoteCalculatedAt: calculatedAt,
        edited: false,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      });
      result.added += 1;
      continue;
    }
    const changed =
      e.plannedAmount !== line.amount ||
      e.name !== line.name ||
      (!e.edited && e.amount !== line.amount);
    e.plannedAmount = line.amount;
    e.name = line.name;
    e.quoteCalculatedAt = calculatedAt;
    if (!e.edited) e.amount = line.amount;
    if (changed) {
      e.updatedAt = now;
      result.updated += 1;
    }
  }

  data.orderExpenses = data.orderExpenses.filter((e) => {
    if (e.orderId !== order.id || e.source !== "calculator" || !e.sourceKey) return true;
    if (seen.has(e.sourceKey)) return true;
    if (e.edited) {
      if (e.plannedAmount !== 0) {
        e.plannedAmount = 0;
        e.updatedAt = now;
      }
      result.kept += 1;
      return true;
    }
    result.removed += 1;
    return false;
  });
  return result;
}

export function syncExpensesFromQuote(
  companyId: string,
  orderId: string,
  actorId: string | null,
): SyncResult {
  let result!: SyncResult;
  mutateData((data) => {
    const order = data.orders.find(
      (o) => o.id === orderId && o.companyId === companyId && isActiveOrder(o),
    );
    if (!order) throw new ExpenseError("Заказ не найден", 404);
    result = syncExpensesInData(data, order, actorId);
  });
  return result;
}

export function listOrderExpenses(companyId: string, orderId: string): OrderExpense[] {
  return getData().orderExpenses.filter(
    (e) => e.companyId === companyId && e.orderId === orderId,
  );
}

export function sumExpenses(expenses: Pick<OrderExpense, "amount">[]): number {
  return expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function assertCategory(data: AppData, companyId: string, key: string) {
  if (!data.expenseCategories.some((c) => c.companyId === companyId && c.key === key)) {
    throw new ExpenseError("Категория не найдена");
  }
}

export function addOrderExpense(
  companyId: string,
  orderId: string,
  input: { category: string; name: string; amount: number; note?: string | null },
  actorId: string,
): OrderExpense {
  let created!: OrderExpense;
  mutateData((data) => {
    if (!data.orders.some((o) => o.id === orderId && o.companyId === companyId && isActiveOrder(o))) {
      throw new ExpenseError("Заказ не найден", 404);
    }
    assertCategory(data, companyId, input.category);
    const now = nowIso();
    created = {
      id: generateId("exp"),
      companyId,
      orderId,
      category: input.category,
      name: input.name.trim(),
      amount: Math.round(input.amount),
      plannedAmount: null,
      note: input.note?.trim() || null,
      source: "manual",
      sourceKey: null,
      quoteCalculatedAt: null,
      edited: false,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    };
    data.orderExpenses.push(created);
  });
  return created;
}

export function updateOrderExpense(
  companyId: string,
  orderId: string,
  expenseId: string,
  patch: {
    category?: string;
    name?: string;
    amount?: number;
    note?: string | null;
    resetToPlanned?: boolean;
  },
): OrderExpense {
  let updated!: OrderExpense;
  mutateData((data) => {
    const e = data.orderExpenses.find(
      (x) => x.id === expenseId && x.orderId === orderId && x.companyId === companyId,
    );
    if (!e) throw new ExpenseError("Расход не найден", 404);
    if (patch.category !== undefined) {
      assertCategory(data, companyId, patch.category);
      e.category = patch.category;
    }
    if (patch.name !== undefined && e.source === "manual") e.name = patch.name.trim();
    if (patch.note !== undefined) e.note = patch.note?.trim() || null;
    if (patch.amount !== undefined) {
      e.amount = Math.round(patch.amount);
      if (e.source === "calculator") e.edited = e.amount !== e.plannedAmount;
    }
    if (patch.resetToPlanned && e.source === "calculator") {
      e.amount = e.plannedAmount ?? 0;
      e.edited = false;
    }
    e.updatedAt = nowIso();
    updated = { ...e };
  });
  return updated;
}

/** Calculator lines are not deleted: the next sync would bring them back. Set them to 0 instead. */
export function deleteOrderExpense(companyId: string, orderId: string, expenseId: string): void {
  mutateData((data) => {
    const e = data.orderExpenses.find(
      (x) => x.id === expenseId && x.orderId === orderId && x.companyId === companyId,
    );
    if (!e) throw new ExpenseError("Расход не найден", 404);
    if (e.source === "calculator") {
      throw new ExpenseError("Строку из калькулятора нельзя удалить, укажите сумму 0");
    }
    data.orderExpenses = data.orderExpenses.filter((x) => x.id !== expenseId);
  });
}
