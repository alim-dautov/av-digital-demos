import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { listTags, salesManagers } from "@/modules/counterparties/service";
import { CpForm } from "../_components/cp-form";

export const metadata = { title: "Новый контрагент" };

export default async function NewCp({ searchParams }: { searchParams: Promise<{ kind?: string; name?: string; phone?: string }> }) {
  const u = await requireUser("counterparties", "full");
  const sp = await searchParams;
  const db = await getDb();
  const [managers, tags] = await Promise.all([salesManagers(db), listTags(db)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href="/counterparties">Контрагенты</BackLink>} title={sp.kind === "supplier" ? "Новый поставщик" : "Новый клиент"} />
      <CpForm edit managers={managers} allTags={tags.map((t) => t.name)} initial={{
        kind: sp.kind === "supplier" ? "supplier" : "client", name: sp.name ?? "", segment: "other", tags: [], phone: sp.phone ?? null, whatsapp: null, email: null,
        address: null, bin: null, comment: "", contacts: [], documents: [], managerId: u.isSalesManager ? u.id : null, debtLimit: 0, debtLimitMode: "default",
      }} />
    </div>
  );
}
