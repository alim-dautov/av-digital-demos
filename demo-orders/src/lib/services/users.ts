import { mutateData } from "@/lib/db";
import type { UserRole } from "@/types";

export const DISPLAY_NAME_MAX = 100;

export class UserNameError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UserNameError";
    this.status = status;
  }
}

export type RenameActor = {
  id: string;
  role: UserRole;
  /** Active company of the session, including a switched or locked company. */
  companyId: string;
};

type NameUser = {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  firstName: string;
  employeeId?: string | null;
};

type NameEmployee = {
  id: string;
  companyId: string;
  fullName: string;
  firstName: string;
};

export type RenamedUser = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
};

/** Trimmed, internal whitespace collapsed. Empty and over-long names are rejected. */
export function normalizeDisplayName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX) {
    throw new UserNameError("Имя должно быть от 1 до 100 символов", 400);
  }
  return name;
}

export function firstNameFromFullName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

/**
 * A person can always rename themselves.
 * OWNER and ADMIN can rename users of the company they are currently in.
 */
export function canRenameUser(
  actor: RenameActor,
  target: { id: string; companyId: string },
): boolean {
  if (actor.id === target.id) return true;
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") return false;
  return target.companyId === actor.companyId;
}

export function renameUserInData(
  data: { users?: NameUser[]; employees?: NameEmployee[] },
  actor: RenameActor,
  userId: string,
  rawName: string,
): RenamedUser {
  const user = data.users?.find((item) => item.id === userId);
  if (!user) throw new UserNameError("Пользователь не найден", 404);
  if (!canRenameUser(actor, user)) {
    throw new UserNameError("Недостаточно прав", 403);
  }

  const fullName = normalizeDisplayName(rawName);
  const firstName = firstNameFromFullName(fullName);
  user.fullName = fullName;
  user.firstName = firstName;

  if (user.employeeId) {
    const employee = data.employees?.find((item) => item.id === user.employeeId);
    if (employee && employee.companyId === user.companyId) {
      employee.fullName = fullName;
      employee.firstName = firstName;
    }
  }

  return { id: user.id, email: user.email, fullName, firstName };
}

export function renameUserDisplayName(
  actor: RenameActor,
  userId: string,
  rawName: string,
): RenamedUser {
  let renamed: RenamedUser | null = null;
  mutateData((data) => {
    renamed = renameUserInData(data, actor, userId, rawName);
  });
  if (!renamed) throw new UserNameError("Пользователь не найден", 404);
  return renamed;
}
