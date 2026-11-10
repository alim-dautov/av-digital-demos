import { getData, mutateData } from "@/lib/db";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import { PURCHASE_CATEGORY_IDS, type InventoryCategory, type Purchase, type PurchaseItem } from "@/types";

function nextNumber(companyId: string, purchases: Purchase[]): string {
  const year = new Date().getFullYear();
  const prefix = `НК-${year}-`;
  const nums = purchases
    .filter((item) => item.companyId === companyId && item.number.startsWith(prefix))
    .map((item) => Number(item.number.slice(prefix.length)))
    .filter((value) => !Number.isNaN(value));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function listPurchases(companyId: string): Purchase[] {
  return getData()
    .purchases.filter((item) => item.companyId === companyId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getPurchase(companyId: string, id: string): Purchase | null {
  return (
    getData().purchases.find(
      (item) => item.companyId === companyId && (item.id === id || item.number === id),
    ) ?? null
  );
}

export function purchaseTotal(purchase: Purchase): number {
  return purchase.items.reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0);
}

export function createPurchase(
  companyId: string,
  input: { supplier: string; comment?: string | null; items: Omit<PurchaseItem, "id" | "materialId">[] },
): Purchase {
  if (!input.supplier.trim()) throw new Error("Укажите поставщика");
  if (!input.items.length) throw new Error("Добавьте позиции");
  let result!: Purchase;
  mutateData((data) => {
    const purchase: Purchase = {
      id: generateId("pur"),
      companyId,
      number: nextNumber(companyId, data.purchases),
      supplier: input.supplier.trim(),
      status: "draft",
      items: input.items.map((item) => ({
        ...normalizeItem(item),
        id: generateId("pi"),
        materialId: null,
      })),
      comment: input.comment?.trim() || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      postedAt: null,
      cashEntryId: null,
    };
    data.purchases.unshift(purchase);
    result = purchase;
  });
  return result;
}

function normalizeItem(item: Omit<PurchaseItem, "id" | "materialId">): Omit<PurchaseItem, "id" | "materialId"> {
  const quantity = Number(item.quantity);
  const price = Number(item.price);
  if (!item.name.trim()) throw new Error("Укажите название позиции");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Укажите количество");
  if (!Number.isFinite(price) || price < 0) throw new Error("Укажите цену");
  return {
    name: item.name.trim(),
    category: item.category,
    quantity,
    unit: item.unit.trim() || "шт",
    price: Math.round(price),
    lengthM: item.category === "cornice" ? Number(item.lengthM) || null : null,
  };
}

export function updatePurchase(
  companyId: string,
  id: string,
  input: { supplier?: string; comment?: string | null; items?: Omit<PurchaseItem, "id" | "materialId">[] },
): Purchase {
  let result: Purchase | null = null;
  mutateData((data) => {
    const purchase = data.purchases.find((item) => item.id === id && item.companyId === companyId);
    if (!purchase) throw new Error("Накладная не найдена");
    if (purchase.status === "posted") throw new Error("Проведённую накладную нельзя менять");
    if (input.supplier != null) purchase.supplier = input.supplier.trim();
    if (input.comment !== undefined) purchase.comment = input.comment?.trim() || null;
    if (input.items) {
      purchase.items = input.items.map((item) => ({
        ...normalizeItem(item),
        id: generateId("pi"),
        materialId: null,
      }));
    }
    purchase.updatedAt = nowIso();
    result = { ...purchase, items: purchase.items.map((item) => ({ ...item })) };
  });
  if (!result) throw new Error("Накладная не найдена");
  return result;
}

export function postPurchase(companyId: string, id: string): Purchase {
  let result: Purchase | null = null;
  mutateData((data) => {
    const purchase = data.purchases.find((item) => item.id === id && item.companyId === companyId);
    if (!purchase) throw new Error("Накладная не найдена");
    if (purchase.status === "posted") throw new Error("Накладная уже проведена");
    if (!purchase.items.length) throw new Error("В накладной нет позиций");

    for (const item of purchase.items) {
      const lengthKey = item.lengthM != null ? String(item.lengthM) : "";
      let material = data.materials.find((row) => {
        if (row.deletedAt || row.companyId !== companyId || row.category !== item.category) return false;
        if (row.name !== item.name) return false;
        const stored = row.attributes?.lengthM ?? "";
        return stored === lengthKey;
      });
      if (!material) {
        material = {
          id: generateId("mat"),
          companyId,
          category: item.category,
          name: item.lengthM ? `${item.name} ${item.lengthM} м` : item.name,
          sku: item.lengthM ? `CRN-${item.lengthM}` : generateId("sku"),
          unit: item.unit,
          quantity: 0,
          minStock: 0,
          unitCost: item.price,
          attributes: item.lengthM ? { lengthM: String(item.lengthM) } : undefined,
        };
        data.materials.push(material);
      }
      material.quantity = Math.round((material.quantity + item.quantity) * 1000) / 1000;
      material.unitCost = item.price;
      item.materialId = material.id;
      data.inventoryMovements.unshift({
        id: generateId("mov"),
        companyId,
        materialId: material.id,
        type: "in",
        quantity: item.quantity,
        unit: item.unit,
        date: todayDate(),
        responsibleId: null,
        orderId: null,
        comment: `Накладная ${purchase.number}`,
        unitCost: item.price,
      });
    }

    const total = purchase.items.reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0);
    const cashId = total > 0 ? generateId("cash") : null;
    if (cashId) {
      data.cashEntries.unshift({
        id: cashId,
        companyId,
        date: todayDate(),
        type: "out",
        amount: total,
        category: "Закуп",
        comment: `Оплата накладной ${purchase.number}, ${purchase.supplier}`,
        orderId: null,
        purchaseId: purchase.id,
        paymentId: null,
        source: "purchase",
        createdAt: nowIso(),
      });
    }
    purchase.status = "posted";
    purchase.postedAt = nowIso();
    purchase.updatedAt = nowIso();
    purchase.cashEntryId = cashId;
    result = { ...purchase, items: purchase.items.map((item) => ({ ...item })) };
  });
  if (!result) throw new Error("Накладная не найдена");
  return result;
}

export const PURCHASE_CATEGORIES = PURCHASE_CATEGORY_IDS;
