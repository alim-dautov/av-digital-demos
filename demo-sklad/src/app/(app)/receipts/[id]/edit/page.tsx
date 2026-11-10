import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { purchaseTypeId } from "@/modules/products/service";
import { getReceipt } from "@/modules/receipts/service";
import { ReceiptEditor } from "../../_components/receipt-editor";

export const metadata = { title: "Изменение приёмки" };

export default async function EditReceipt({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("receipts", "full");
  const db = await getDb();
  const r = await getReceipt(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  return (
    <>
      <PageHeader back={<BackLink href={`/receipts/${r.id}`}>Приёмка №{r.number}</BackLink>} title={`Приёмка №${r.number}`} subtitle="редактирование" />
      <ReceiptEditor purchaseTypeId={await purchaseTypeId(db)} initial={{
        id: r.id, supplier: { id: r.supplier.id, name: r.supplier.name, phone: r.supplier.phone, segment: r.supplier.segment, isService: false, clientDebt: 0, managerId: null },
        date: r.date, supplierDocNumber: r.supplierDocNumber ?? "", comment: r.comment, posted: r.posted, sourceFile: r.sourceFile,
        items: r.items.map((i) => ({ key: `e${i.id}`, productId: i.productId, name: i.name, unit: i.unit, qty: i.qty, price: i.price ?? 0, excluded: i.excluded })),
      }} />
    </>
  );
}
