import { MEBELDEMO_ID } from "@/lib/company";
import { can, type AccessSubject } from "@/lib/rbac";
import { getData, mutateData, mutateDataLocked } from "@/lib/db";
import { generateId, todayDate } from "@/lib/utils";
import type {
  InventoryCategory,
  InventoryMovement,
  Material,
  MovementType,
} from "@/types";

export function listMaterials(
  companyId: string,
  category?: InventoryCategory,
): Material[] {
  let materials = getData().materials.filter((m) => m.companyId === companyId && !m.deletedAt);
  if (category) materials = materials.filter((m) => m.category === category);
  return materials.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function getStockSummary(companyId: string): {
  totalSkus: number;
  lowStockCount: number;
  totalValue: number;
  byCategory: Record<InventoryCategory, { count: number; value: number }>;
} {
  const materials = listMaterials(companyId);
  const byCategory: Record<
    InventoryCategory,
    { count: number; value: number }
  > = {
    hardware: { count: 0, value: 0 },
    sheet: { count: 0, value: 0 },
    consumables: { count: 0, value: 0 },
    machine: { count: 0, value: 0 },
    fabric_portiere: { count: 0, value: 0 },
    fabric_tulle: { count: 0, value: 0 },
    sewing_hardware: { count: 0, value: 0 },
    cornice: { count: 0, value: 0 },
    roman_mechanism: { count: 0, value: 0 },
  };
  let totalValue = 0;
  let lowStockCount = 0;
  for (const m of materials) {
    const value = m.quantity * m.unitCost;
    totalValue += value;
    byCategory[m.category].count += 1;
    byCategory[m.category].value += value;
    if (m.quantity <= m.minStock) lowStockCount += 1;
  }
  return {
    totalSkus: materials.length,
    lowStockCount,
    totalValue,
    byCategory,
  };
}

export function getLowStock(companyId: string): Material[] {
  return listMaterials(companyId).filter((m) => m.quantity <= m.minStock);
}

export function createMovement(input: {
  companyId: string;
  materialId: string;
  type: MovementType;
  quantity: number;
  date?: string;
  responsibleId?: string | null;
  orderId?: string | null;
  comment?: string | null;
}): InventoryMovement {
  let movement: InventoryMovement | null = null;
  mutateData((data) => {
    const material = data.materials.find(
      (m) => m.id === input.materialId && m.companyId === input.companyId && !m.deletedAt,
    );
    if (!material) {
      throw new Error("Материал не найден");
    }

    let delta = 0;
    switch (input.type) {
      case "in":
        delta = Math.abs(input.quantity);
        break;
      case "out":
        delta = -Math.abs(input.quantity);
        break;
      case "transfer":
        delta = 0;
        break;
      case "adjustment":
        delta = input.quantity;
        break;
    }
    material.quantity = Math.max(0, material.quantity + delta);

    // Sync atelier fabric stock if linked
    const fabric = data.atelierFabrics?.find(
      (f) => f.materialId === material.id && f.companyId === input.companyId,
    );
    if (fabric) {
      fabric.stock = material.quantity;
      fabric.metrage = material.quantity;
    }

    movement = {
      id: generateId("mov"),
      companyId: input.companyId,
      materialId: input.materialId,
      type: input.type,
      quantity: input.quantity,
      unit: material.unit,
      date: input.date ?? todayDate(),
      responsibleId: input.responsibleId ?? null,
      orderId: input.orderId ?? null,
      comment: input.comment ?? null,
    };
    data.inventoryMovements.unshift(movement);
  });
  return movement!;
}

export type ReceiptLineInput = {
  materialId: string;
  quantity: number;
  unitCost: number;
  attributes?: Record<string, string>;
};

/** Multi-line goods receipt; all lines are applied atomically. */
export function createReceipt(input: {
  companyId: string;
  lines: ReceiptLineInput[];
  date?: string;
  responsibleId?: string | null;
  comment?: string | null;
}): { receiptId: string; movements: InventoryMovement[]; total: number } {
  if (!input.lines.length) throw new Error("Добавьте хотя бы одну позицию");
  const receiptId = generateId("rcpt");
  const movements: InventoryMovement[] = [];
  let total = 0;
  mutateData((data) => {
    const materials = input.lines.map((line) => {
      const m = data.materials.find(
        (x) => x.id === line.materialId && x.companyId === input.companyId && !x.deletedAt,
      );
      if (!m) throw new Error("Материал не найден");
      if (!(line.quantity > 0)) throw new Error(`«${m.name}»: количество должно быть больше 0`);
      if (line.unitCost < 0) throw new Error(`«${m.name}»: цена не может быть отрицательной`);
      return m;
    });

    input.lines.forEach((line, i) => {
      const material = materials[i];
      const prevQty = Math.max(0, material.quantity);
      const nextQty = prevQty + line.quantity;
      material.unitCost =
        nextQty > 0
          ? Math.round(((prevQty * material.unitCost + line.quantity * line.unitCost) / nextQty) * 100) / 100
          : line.unitCost;
      material.quantity = nextQty;
      if (line.attributes && Object.keys(line.attributes).length) {
        material.attributes = { ...material.attributes, ...line.attributes };
      }

      const fabric = data.atelierFabrics?.find(
        (f) => f.materialId === material.id && f.companyId === input.companyId,
      );
      if (fabric) {
        fabric.stock = material.quantity;
        fabric.metrage = material.quantity;
        fabric.costPrice = material.unitCost;
      }

      total += line.quantity * line.unitCost;
      const movement: InventoryMovement = {
        id: generateId("mov"),
        companyId: input.companyId,
        materialId: material.id,
        type: "in",
        quantity: line.quantity,
        unit: material.unit,
        date: input.date ?? todayDate(),
        responsibleId: input.responsibleId ?? null,
        orderId: null,
        comment: input.comment ?? null,
        unitCost: line.unitCost,
        receiptId,
        attributes: line.attributes,
      };
      movements.push(movement);
      data.inventoryMovements.unshift(movement);
    });
  });
  return { receiptId, movements, total: Math.round(total) };
}

export function createMaterial(input: {
  companyId: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  sku?: string;
  minStock?: number;
  unitCost?: number;
  attributes?: Record<string, string>;
}): Material {
  const name = input.name.trim();
  if (!name) throw new Error("Укажите наименование");
  let material!: Material;
  mutateData((data) => {
    const dup = data.materials.find(
      (m) => m.companyId === input.companyId && !m.deletedAt && m.name.toLowerCase() === name.toLowerCase(),
    );
    if (dup) throw new Error("Позиция с таким названием уже есть");
    const count = data.materials.filter((m) => m.companyId === input.companyId).length + 1;
    material = {
      id: generateId("mat"),
      companyId: input.companyId,
      category: input.category,
      name,
      sku: input.sku?.trim() || `SKU-${String(count).padStart(4, "0")}`,
      unit: input.unit.trim() || "шт",
      quantity: 0,
      minStock: input.minStock ?? 0,
      unitCost: input.unitCost ?? 0,
      attributes: input.attributes,
    };
    data.materials.push(material);
  });
  return material;
}

export function listMovements(
  companyId: string,
  opts?: { materialId?: string; limit?: number },
): InventoryMovement[] {
  let movements = getData().inventoryMovements.filter(
    (m) => m.companyId === companyId,
  );
  if (opts?.materialId) {
    movements = movements.filter((m) => m.materialId === opts.materialId);
  }
  movements = movements.sort((a, b) => (a.date < b.date ? 1 : -1));
  if (opts?.limit) return movements.slice(0, opts.limit);
  return movements;
}

/** Soft delete only: keep material identity, balances and all historical references. */
export function archiveMaterials(companyId: string, actor: AccessSubject, ids: string[]): number {
  if (companyId !== MEBELDEMO_ID || !can(actor, "inventory", "manage")) {
    throw new Error("Недостаточно прав для удаления позиций склада");
  }
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 10000) throw new Error("Выберите от 1 до 10000 позиций");
  return mutateDataLocked((data) => {
    // Validate the entire batch on fresh data under lock BEFORE touching any row.
    const rows = unique.map((id) => data.materials.find(
      (m) => m.id === id && m.companyId === companyId && !m.deletedAt,
    ));
    if (rows.some((m) => !m)) throw new Error("Позиция не найдена или уже удалена. Обновите склад");
    const deletedAt = new Date().toISOString();
    for (const row of rows) row!.deletedAt = deletedAt;
    return rows.length;
  });
}
