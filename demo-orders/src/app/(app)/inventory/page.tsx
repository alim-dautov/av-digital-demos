import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { MEBELDEMO_ID, isTextilesCompany } from "@/lib/company";
import {
  getLowStock,
  getStockSummary,
  listMaterials,
  listMovements,
} from "@/lib/services/inventory";
import { InventoryView } from "./inventory-view";

export default async function InventoryPage() {
  const session = await requirePageAccess("inventory");

  const materials = listMaterials(session.companyId);
  const lowStock = getLowStock(session.companyId);
  const summary = getStockSummary(session.companyId);
  const movements = listMovements(session.companyId, { limit: 50 });
  const textiles = isTextilesCompany(session.companyId);

  return (
    <InventoryView
      materials={materials}
      lowStock={lowStock}
      summary={summary}
      canDelete={session.companyId === MEBELDEMO_ID && can(session, "inventory", "manage")}
      canWrite={can(session, "inventory", "write")}
      textiles={textiles}
      movements={movements}
    />
  );
}
