import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { assertFlag } from "@/lib/rbac";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { purchaseTypeId } from "@/modules/products/service";
import { ReceiptEditor } from "../_components/receipt-editor";

export const metadata = { title: "Новая приёмка" };

export default async function NewReceipt() {
  const u = await requireUser("receipts", "full");
  assertFlag(u, "seePurchase");
  const db = await getDb();
  return (
    <>
      <PageHeader back={<BackLink href="/receipts">Приёмки</BackLink>} title="Новая приёмка" />
      <ReceiptEditor purchaseTypeId={await purchaseTypeId(db)} initial={{ supplier: null, date: today(), supplierDocNumber: "", comment: "", posted: false, sourceFile: null, items: [] }} />
    </>
  );
}
