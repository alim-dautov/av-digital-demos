import type { AppData } from "@/types";

/** В демо-версии отдельных «боевых» пользователей нет. Константы оставлены для совместимости. */
export const GULYA_EMAIL = "seamstress@example.com";
export const GULYA_USER_ID = "user_zp_seamstress";
export const GULYA_EMPLOYEE_ID = "emp_zp_seamstress";

export function ensureGulyaUser(_data: AppData): boolean {
  return false;
}
