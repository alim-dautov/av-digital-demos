import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listClients } from "@/lib/services/clients";
import { ClientsView } from "./clients-view";

export default async function ClientsPage() {
  const session = await requirePageAccess("clients");

  const clients = listClients(session.companyId);

  return (
    <ClientsView
      clients={clients}
      canWrite={can(session, "clients", "write")}
    />
  );
}
