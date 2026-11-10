import { redirect } from "next/navigation";
import { AtelierAnalyticsView } from "@/features/analytics/atelier-analytics-view";
import { getSession } from "@/lib/auth";
import { isTextilesCompany } from "@/lib/company";
import { can } from "@/lib/rbac";
import { getFullAnalytics } from "@/lib/services/analytics";
import { getAtelierAnalytics } from "@/lib/services/atelier-analytics";
import { AnalyticsView } from "./analytics-view";

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) return null;
  if (!can(session, "analytics", "read")) {
    redirect("/");
  }

  if (isTextilesCompany(session.companyId)) {
    return (
      <AtelierAnalyticsView
        periods={{
          day: getAtelierAnalytics(session.companyId, "day"),
          week: getAtelierAnalytics(session.companyId, "week"),
          month: getAtelierAnalytics(session.companyId, "month"),
        }}
      />
    );
  }

  const analytics = getFullAnalytics(session.companyId, "month");

  return (
    <AnalyticsView
      initial={{
        period: analytics.period,
        kpis: analytics.kpis,
        trend: analytics.trend,
        statusDistribution: analytics.statusDistribution,
        leadSources: analytics.leadSources,
        masters: analytics.masters,
        periodFinance: analytics.periodFinance,
        conversion: analytics.conversion,
        productionStages: analytics.productionStages,
      }}
    />
  );
}
