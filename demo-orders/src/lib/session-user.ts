import type { SessionUser, UserAccount, UserRole } from "@/types";

const MULTI_COMPANY_ROLES: UserRole[] = ["OWNER", "ADMIN"];

export function canAccessCompany(
  user: Pick<UserAccount, "role" | "companyId">,
  companyId: string,
) {
  return MULTI_COMPANY_ROLES.includes(user.role) || user.companyId === companyId;
}

export function toSessionUser(user: UserAccount, companyId: string): SessionUser {
  return {
    id: user.id,
    email: user.email,
    login: user.login ?? null,
    fullName: user.fullName,
    firstName: user.firstName,
    role: user.role,
    access: user.access ?? null,
    permissions: user.permissions ?? null,
    companyId,
    employeeId: user.employeeId,
    avatarUrl: user.avatarUrl,
  };
}
