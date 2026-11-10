import bcrypt from "bcryptjs";
import { getData, mutateData } from "@/lib/db";
import {
  ALL_RESOURCES,
  canDeleteOrders,
  isAccessRestrictable,
  roleDefaultLevel,
  type Resource,
} from "@/lib/rbac";
import { generateId, todayDate } from "@/lib/utils";
import type { AccessLevel, AccessOverrides, SessionUser, UserAccount, UserRole } from "@/types";

export const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const MIN_PASSWORD_LENGTH = 8;

/** Roles an admin can hand out. OWNER is given only by another owner. */
export const ASSIGNABLE_ROLES: UserRole[] = [
  "ADMIN",
  "DIRECTOR",
  "MANAGER",
  "SEAMSTRESS",
  "MOBILOGRAPHER",
  "WORKSHOP",
  "DESIGNER",
  "TECHNOLOGIST",
  "MASTER",
  "DRIVER",
];

export class StaffError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export type StaffUser = {
  id: string;
  login: string | null;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  position: string | null;
  access: AccessOverrides;
  restrictable: boolean;
  /** Owners delete orders by role; for them this reflects that, not a stored grant. */
  deleteOrders: boolean;
};

type Actor = Pick<SessionUser, "id" | "role" | "companyId">;

function toStaffUser(user: UserAccount, position: string | null): StaffUser {
  return {
    id: user.id,
    login: user.login ?? null,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    position,
    access: user.access ?? {},
    restrictable: isAccessRestrictable(user.role),
    deleteOrders: canDeleteOrders(user),
  };
}

export function listStaff(companyId: string): StaffUser[] {
  const data = getData();
  return data.users
    .filter((u) => u.companyId === companyId)
    .map((u) =>
      toStaffUser(u, data.employees.find((e) => e.id === u.employeeId)?.position ?? null),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
}

function findTarget(data: { users: UserAccount[] }, actor: Actor, userId: string) {
  const user = data.users.find((u) => u.id === userId && u.companyId === actor.companyId);
  if (!user) throw new StaffError("Сотрудник не найден", 404);
  if (user.role === "OWNER" && actor.role !== "OWNER") {
    throw new StaffError("Учётную запись владельца меняет только владелец", 403);
  }
  return user;
}

function assertLoginFree(users: UserAccount[], login: string, exceptId?: string) {
  if (!LOGIN_PATTERN.test(login)) {
    throw new StaffError("Логин: 3–32 символа, латиница, цифры, точка, дефис или подчёркивание");
  }
  if (users.some((u) => u.id !== exceptId && (u.login?.toLowerCase() === login || u.email === login))) {
    throw new StaffError("Такой логин уже занят", 409);
  }
}

function assertPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new StaffError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
  }
}

function assertRole(actor: Actor, role: UserRole) {
  if (role === "OWNER" ? actor.role !== "OWNER" : !ASSIGNABLE_ROLES.includes(role)) {
    throw new StaffError("Недопустимая роль", 403);
  }
}

/** Keeps only overrides that differ from the role default. */
export function normalizeAccess(
  role: UserRole,
  access: Partial<Record<string, AccessLevel>>,
): AccessOverrides {
  const result: AccessOverrides = {};
  for (const resource of ALL_RESOURCES) {
    const level = access[resource];
    if (!level) continue;
    if (level !== roleDefaultLevel(role, resource)) result[resource] = level;
  }
  return result;
}

export function createStaff(
  actor: Actor,
  input: {
    fullName: string;
    login: string;
    password: string;
    role: UserRole;
    position?: string | null;
  },
): StaffUser {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (!fullName) throw new StaffError("Укажите имя");
  const login = input.login.trim().toLowerCase();
  assertRole(actor, input.role);
  assertPassword(input.password);
  const passwordHash = bcrypt.hashSync(input.password, 12);
  let created!: StaffUser;
  mutateData((data) => {
    assertLoginFree(data.users, login);
    const employeeId = generateId("emp");
    const firstName = fullName.split(" ").at(-1) ?? fullName;
    const position = input.position?.trim() || null;
    data.employees.push({
      id: employeeId,
      companyId: actor.companyId,
      fullName,
      firstName,
      phone: "",
      position: position ?? "",
      role: input.role,
      status: "active",
      hireDate: todayDate(),
      compensationType: "fixed",
      percentage: null,
      fixedSalary: null,
      photoUrl: null,
      isMeasurer: false,
    });
    const user: UserAccount = {
      id: generateId("user"),
      companyId: actor.companyId,
      email: "",
      login,
      passwordHash,
      fullName,
      firstName,
      role: input.role,
      employeeId,
      avatarUrl: null,
      isActive: true,
      access: null,
    };
    data.users.push(user);
    created = toStaffUser(user, position);
  });
  return created;
}

export function updateStaff(
  actor: Actor,
  userId: string,
  patch: {
    role?: UserRole;
    isActive?: boolean;
    password?: string;
    login?: string;
    access?: Partial<Record<Resource, AccessLevel>>;
    deleteOrders?: boolean;
  },
): StaffUser {
  const self = userId === actor.id;
  if (
    self &&
    (patch.role !== undefined ||
      patch.isActive === false ||
      patch.access !== undefined ||
      patch.deleteOrders !== undefined)
  ) {
    throw new StaffError("Свою роль и доступ изменить нельзя", 403);
  }
  if (patch.role !== undefined) assertRole(actor, patch.role);
  if (patch.password !== undefined) assertPassword(patch.password);
  const passwordHash = patch.password ? bcrypt.hashSync(patch.password, 12) : null;

  let updated!: StaffUser;
  mutateData((data) => {
    const user = findTarget(data, actor, userId);
    const activeOwners = data.users.filter((u) => u.role === "OWNER" && u.isActive);
    const lastOwner = user.role === "OWNER" && activeOwners.length <= 1;
    if (lastOwner && (patch.isActive === false || (patch.role && patch.role !== "OWNER"))) {
      throw new StaffError("Нельзя отключить последнего владельца", 409);
    }
    if (patch.login !== undefined) {
      const login = patch.login.trim().toLowerCase();
      assertLoginFree(data.users, login, user.id);
      user.login = login;
    }
    if (patch.role !== undefined) {
      user.role = patch.role;
      const employee = data.employees.find((e) => e.id === user.employeeId);
      if (employee) employee.role = patch.role;
    }
    if (patch.isActive !== undefined && patch.isActive !== user.isActive) {
      user.isActive = patch.isActive;
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    }
    if (passwordHash) {
      user.passwordHash = passwordHash;
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    }
    if (patch.access !== undefined) {
      user.access = isAccessRestrictable(user.role) ? normalizeAccess(user.role, patch.access) : null;
    } else if (patch.role !== undefined && user.access) {
      user.access = isAccessRestrictable(user.role) ? normalizeAccess(user.role, user.access) : null;
    }
    if (patch.deleteOrders !== undefined && user.role !== "OWNER") {
      user.permissions = { ...user.permissions, deleteOrders: patch.deleteOrders };
    }
    if (!user.isActive) {
      data.pushSubscriptions = data.pushSubscriptions.filter((s) => s.userId !== user.id);
    }
    updated = toStaffUser(
      user,
      data.employees.find((e) => e.id === user.employeeId)?.position ?? null,
    );
  });
  return updated;
}
