import { workshopBadgeCount } from "@/lib/services/workshop";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { headers } from "next/headers";
import {
  accessibleCompanies,
  findActiveUser,
  getSession,
  redirectInCompany,
} from "@/lib/auth";
import { COMPANY_APP_HEADER, getCompanyAppBySlug } from "@/lib/company-apps";
import { getData } from "@/lib/db";
import { bootstrap } from "@/lib/bootstrap";
import { AppShell } from "@/components/layout/app-shell";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { DemoBanner } from "@/components/demo-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await bootstrap();
  const session = await getSession();
  if (!session) return redirectInCompany("/login");

  const lockedSlug = (await headers()).get(COMPANY_APP_HEADER);
  const lockedApp = lockedSlug ? getCompanyAppBySlug(lockedSlug) : null;

  const data = getData();
  const account = findActiveUser(session.id);
  if (!account) return redirectInCompany("/login");
  const companies = accessibleCompanies(account, data.companies);
  const visibleCompanies = lockedApp
    ? companies.filter((company) => company.id === lockedApp.companyId)
    : companies;
  if (lockedApp && visibleCompanies.length === 0) {
    return redirectInCompany("/denied");
  }
  const company =
    companies.find((c) => c.id === session.companyId) ?? companies[0];

  const notifications = data.notifications
    .filter(
      (n) =>
        n.companyId === session.companyId &&
        (n.userId === null || n.userId === session.id),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 20);

  const navBadges: Record<string, number> = {};
  if (isTextilesCompany(session.companyId) && can(session, "workshop", "write")) {
    const n = workshopBadgeCount(data, session.companyId, session.id);
    if (n > 0) navBadges["/workshop"] = n;
  }

  return (
    <AppShell
      navBadges={navBadges}
      user={session}
      companies={visibleCompanies}
      notifications={notifications}
      companyStatus={company?.status ?? "active"}
      companyName={company?.name ?? lockedApp?.name ?? "Mebel Demo"}
      companyTagline={company?.tagline ?? "мебель на заказ"}
      companyVertical={company?.vertical ?? "furniture"}
      companyLocked={Boolean(lockedApp)}
    >
      {process.env.DEMO_MODE === "1" && <DemoBanner />}
      {children}
      <PwaInstallBanner appName={lockedApp?.name ?? company?.name ?? "Mebel Demo"} />
    </AppShell>
  );
}
