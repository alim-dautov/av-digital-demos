import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { listFolders, visiblePriceTypes } from "@/modules/products/service";
import { ProductForm } from "../_components/product-form";

export const metadata = { title: "Новый товар" };

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ folder?: string; name?: string }> }) {
  const u = await requireUser("products", "full");
  const db = await getDb();
  const { folder, name } = await searchParams;
  const [types, folders] = await Promise.all([visiblePriceTypes(db, u), listFolders(db)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href="/products">Товары</BackLink>} title="Новый товар" />
      <ProductForm edit types={types.map((t) => ({ id: t.id, name: t.name, isPurchase: t.isPurchase }))} folders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))}
        initial={{ name: (name ?? "").slice(0, 200), sku: null, barcode: null, unit: "шт", description: "", folderId: folder ? Number(folder) : null, minStock: 0, active: true, photos: [], prices: {} }} />
    </div>
  );
}
