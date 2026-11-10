import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { InventoryEditor } from "./inventory-editor";

export const metadata = { title: "Инвентаризация" };

export default async function NewInventory() {
  await requireUser("stock", "full");
  return (
    <>
      <PageHeader back={<BackLink href="/stock?tab=inventory">Склад</BackLink>} title="Новая инвентаризация" />
      <InventoryEditor />
    </>
  );
}
