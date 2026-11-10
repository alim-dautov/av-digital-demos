import bcrypt from "bcryptjs";
import { DEMO_EMAILS, DEMO_PASSWORD, LEGACY_DEMO_PASSWORDS } from "@/lib/demo";
import { demoAccountsEnabled } from "@/lib/env";
import { generateId } from "@/lib/utils";
import type { AppData } from "@/types";

const MIN_OWNER_PASSWORD_LENGTH = 12;

type DemoMatch = "current" | "legacy" | null;

function matchDemoPassword(hash: string): DemoMatch {
  if (bcrypt.compareSync(DEMO_PASSWORD, hash)) return "current";
  if (LEGACY_DEMO_PASSWORDS.some((p) => bcrypt.compareSync(p, hash))) return "legacy";
  return null;
}

/**
 * Демо-аккаунты — пользователи из DEMO_EMAILS и все, у кого демо-пароль (текущий или старый).
 * Когда демо разрешено, они активны и входят по DEMO_PASSWORD; иначе отключаются те,
 * у кого демо-пароль. Возвращает true, если data изменилась.
 */
export function syncDemoAccounts(data: AppData): boolean {
  const allowDemo = demoAccountsEnabled();
  let changed = false;
  const matches = new Map<string, DemoMatch>();
  let currentHash: string | null = null;

  for (const user of data.users) {
    if (!allowDemo && !user.isActive) continue;
    let match = matches.get(user.passwordHash);
    if (match === undefined) {
      match = matchDemoPassword(user.passwordHash);
      matches.set(user.passwordHash, match);
    }
    const isDemoEmail = DEMO_EMAILS.includes(user.email);
    if (!match && !(allowDemo && isDemoEmail)) continue;

    if (!allowDemo) {
      user.isActive = false;
      changed = true;
      continue;
    }
    if (match !== "current") {
      currentHash ??= bcrypt.hashSync(DEMO_PASSWORD, 10);
      user.passwordHash = currentHash;
      changed = true;
    }
    if (!user.isActive) {
      user.isActive = true;
      changed = true;
    }
  }
  return changed;
}

/**
 * Production-гарантии для пользователей: демо-аккаунты отключены (если демо не разрешено),
 * есть хотя бы один активный владелец. Возвращает true, если data изменилась.
 */
export function secureProductionUsers(data: AppData): boolean {
  let changed = syncDemoAccounts(data);
  if (demoAccountsEnabled()) return changed;

  if (data.users.some((u) => u.isActive && u.role === "OWNER")) return changed;

  const email = process.env.INITIAL_OWNER_EMAIL?.toLowerCase().trim();
  const password = process.env.INITIAL_OWNER_PASSWORD ?? "";
  if (!email || password.length < MIN_OWNER_PASSWORD_LENGTH) {
    throw new Error(
      `Нет активного владельца. Задайте INITIAL_OWNER_EMAIL и INITIAL_OWNER_PASSWORD (минимум ${MIN_OWNER_PASSWORD_LENGTH} символов)`,
    );
  }

  const companyId =
    data.companies.find((c) => c.status === "active")?.id ?? data.companies[0]?.id;
  if (!companyId) throw new Error("В базе нет ни одной компании");

  const fullName = process.env.INITIAL_OWNER_NAME?.trim() || "Владелец";
  const passwordHash = bcrypt.hashSync(password, 12);
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = "OWNER";
    existing.isActive = true;
  } else {
    data.users.push({
      id: generateId("user"),
      companyId,
      email,
      passwordHash,
      fullName,
      firstName: fullName.split(/\s+/)[0],
      role: "OWNER",
      employeeId: null,
      avatarUrl: null,
      isActive: true,
    });
  }
  changed = true;
  return changed;
}
