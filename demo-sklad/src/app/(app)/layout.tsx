import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { can, canPayroll } from "@/lib/rbac";
import { activeUsers } from "@/modules/counterparties/service";
import { AppShell } from "@/components/shell/app-shell";
import { NAV } from "@/components/shell/nav";
import { SearchBoot } from "@/components/search-boot";
import { DemoBanner } from "@/components/demo-banner";
import { isDemo } from "@/lib/demo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const db = await getDb();
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (i.flag === "payroll" ? canPayroll(u) : !i.module || can(u, i.module))) })).filter((g) => g.items.length);
  const people = can(u, "tasks") || can(u, "pipeline") ? await activeUsers(db) : [];
  return (
    <AppShell
      user={{ id: u.id, name: u.name, position: u.position, color: u.color, isOwner: u.isOwner }}
      nav={nav}
      vapidKey={process.env.VAPID_PUBLIC_KEY || null}
      quick={{
        me: u.id,
        people: people.map((p) => ({ id: p.id, name: p.name, isSalesManager: p.isSalesManager })),
        can: { task: can(u, "tasks", "full"), note: can(u, "notes", "full"), lead: can(u, "pipeline", "full"), order: can(u, "orders", "full") },
      }}
    >
      {isDemo() && <DemoBanner />}
      <SearchBoot userId={u.id} />
      {children}
    </AppShell>
  );
}
