import { getSession } from "@/lib/auth";
import { can, canManageAccess } from "@/lib/rbac";
import { ASSIGNABLE_ROLES, listStaff } from "@/lib/services/staff-access";
import { StaffAccessAdmin } from "@/features/settings/staff-access-admin";
import { PushSettings } from "@/features/notifications/push-settings";
import { DemoDataAdmin } from "@/features/settings/demo-data-admin";
import { FinanceResetAdmin } from "@/features/settings/finance-reset-admin";
import { canResetFinance } from "@/lib/services/finance-reset";
import { GrokIntegrationAdmin } from "@/features/settings/grok-integration-admin";
import { grokAdminView } from "@/lib/integrations/grok/admin-view";
import { getData } from "@/lib/db";
import { isFurnitureCompany, isTextilesCompany } from "@/lib/company";
import { getCompany } from "@/lib/services/companies";
import { getSettings } from "@/lib/services/settings";
import { PersonalSettings } from "@/features/settings/personal-settings";
import {
  CONFIGURABLE_NOTIFICATION_TYPES,
  getNotificationPrefs,
} from "@/lib/services/account-settings";
import { listAdvances, listPenalties, listSalaryPayments, listSalaries } from "@/lib/services/payroll";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import { listAtelierFabrics } from "@/lib/services/atelier-catalog";
import { listFurniturePrices } from "@/lib/services/furniture-catalog";
import { SettingsForm } from "./settings-form";
import { CompanyAdmin } from "@/features/settings/company-admin";
import { EmployeePayrollAdmin } from "@/features/settings/employee-payroll-admin";
import { ProductionFunnelAdmin } from "@/features/settings/production-funnel-admin";
import { getFunnel, stageUsage } from "@/lib/services/production-funnel";
import { AtelierCatalogAdmin } from "@/features/settings/atelier-catalog-admin";
import { FurnitureCatalogAdmin } from "@/features/settings/furniture-catalog-admin";
import { AtelierLabelsAdmin } from "@/features/settings/atelier-labels-admin";
import {
  getAtelierLabels,
  getAtelierServicePrices,
} from "@/lib/services/atelier-labels";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;
  const canManageCompanySettings = can(session, "settings", "read");
  const company = canManageCompanySettings ? getCompany(session.companyId) : null;
  const data = getData();
  const notificationPrefs = getNotificationPrefs(session.id);
  const employeeId = session.employeeId;
  const salary = employeeId ? listSalaries(session.companyId).filter((row) => row.employeeId === employeeId) : [];
  const payments = employeeId ? listSalaryPayments(session.companyId, { employeeId }) : [];
  const advances = employeeId ? listAdvances(session.companyId, { employeeId }) : [];
  const penalties = employeeId ? listPenalties(session.companyId).filter((row) => row.employeeId === employeeId) : [];
  const work = data.orders
    .filter((order) => order.companyId === session.companyId && isActiveOrder(order) && (!!employeeId && (order.masterId === employeeId || order.masterIds?.includes(employeeId) || order.responsibleId === employeeId || order.acceptedBy?.userId === session.id)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((order) => ({ id: order.id, number: order.number, description: order.description, status: order.status, deadline: order.deadline, updatedAt: order.updatedAt }));

  const personal = (
    <>
      <PersonalSettings
        settings={notificationPrefs}
        notificationTypes={CONFIGURABLE_NOTIFICATION_TYPES}
        salary={salary}
        payments={payments}
        advances={advances}
        penalties={penalties}
        work={work}
      />
      <PushSettings />
    </>
  );
  if (!canManageCompanySettings || !company) return personal;

  const settings = getSettings(session.companyId);
  const users = data
    .users.filter((u) => u.companyId === session.companyId)
    .map((u) => ({
      id: u.id,
      email: u.email || u.login || "",
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
    }));

  const textiles = isTextilesCompany(session.companyId);
  const furniture = isFurnitureCompany(session.companyId);
  const fabrics = textiles ? listAtelierFabrics(session.companyId, true) : [];
  const furniturePrices = furniture ? listFurniturePrices(session.companyId) : [];

  return (
    <div className="space-y-8">
      {personal}
      {(session.role === "OWNER" || session.role === "ADMIN") && <CompanyAdmin company={company} />}
      <SettingsForm
        company={company}
        settings={settings}
        users={users}
        canWrite={can(session, "settings", "write")}
        profile={{
          id: session.id,
          email: session.email || session.login || "",
          fullName: session.fullName,
        }}
        canRenameOthers={session.role === "OWNER" || session.role === "ADMIN"}
      />
      {canManageAccess(session) && (
        <StaffAccessAdmin
          initialUsers={listStaff(session.companyId)}
          assignableRoles={ASSIGNABLE_ROLES}
          currentUserId={session.id}
          isOwner={session.role === "OWNER"}
        />
      )}
      {canManageAccess(session) && (
        <EmployeePayrollAdmin
          defaultAdvancePercent={settings.advanceMaxPercent}
          employees={getData()
            .employees.filter(
              (e) => e.companyId === session.companyId && e.status !== "fired",
            )
            .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"))
            .map((e) => ({
              id: e.id,
              fullName: e.fullName,
              position: e.position,
              supervisorId: e.supervisorId ?? null,
              advanceMaxPercent: e.advanceMaxPercent ?? null,
              percentBased:
                e.compensationType === "percentage" ||
                e.compensationType === "percentage_projects",
            }))}
        />
      )}
      {furniture && canManageAccess(session) && (
        <ProductionFunnelAdmin
          initial={(() => {
            const usage = stageUsage(session.companyId);
            return getFunnel(session.companyId).map((s) => ({
              key: s.key,
              label: s.label,
              used: usage.get(s.key) ?? 0,
            }));
          })()}
        />
      )}
      {canManageAccess(session) && <DemoDataAdmin />}
      {canResetFinance(session) && <FinanceResetAdmin />}
      {textiles && can(session, "settings", "manage") && (
        <GrokIntegrationAdmin initial={grokAdminView(session.companyId)} />
      )}
      {textiles && (
        <AtelierLabelsAdmin
          labels={getAtelierLabels(session.companyId)}
          servicePrices={getAtelierServicePrices(session.companyId)}
          canWrite={can(session, "settings", "write")}
        />
      )}
      {textiles && (
        <AtelierCatalogAdmin
          fabrics={fabrics}
          canManage={can(session, "settings", "manage")}
        />
      )}
      {furniture && furniturePrices.length > 0 && (
        <FurnitureCatalogAdmin
          prices={furniturePrices}
          canManage={can(session, "settings", "manage")}
        />
      )}
    </div>
  );
}
