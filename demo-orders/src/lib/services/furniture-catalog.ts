import { getData, mutateData } from "@/lib/db";
import type { FurniturePriceItem } from "@/types";

export function listFurniturePrices(companyId: string): FurniturePriceItem[] {
  return getData()
    .furniturePriceItems.filter((p) => p.companyId === companyId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export type FurniturePriceUpdate = {
  id: string;
  price?: number;
  name?: string;
  active?: boolean;
  sheetWidth?: number | null;
  sheetHeight?: number | null;
};

export function updateFurniturePrices(
  companyId: string,
  updates: FurniturePriceUpdate[],
): FurniturePriceItem[] {
  mutateData((data) => {
    for (const u of updates) {
      const item = data.furniturePriceItems.find(
        (p) => p.id === u.id && p.companyId === companyId,
      );
      if (!item) continue;
      if (typeof u.price === "number" && u.price >= 0) item.price = Math.round(u.price);
      if (typeof u.name === "string" && u.name.trim()) item.name = u.name.trim();
      if (typeof u.active === "boolean") item.active = u.active;
      if (item.unit === "sheet") {
        if (u.sheetWidth !== undefined) item.sheetWidth = u.sheetWidth;
        if (u.sheetHeight !== undefined) item.sheetHeight = u.sheetHeight;
      }
    }
  });
  return listFurniturePrices(companyId);
}
