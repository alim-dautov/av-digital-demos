const DEV_AUTH_SECRET = "mebeldemo-os-demo-secret-change-me";
const MIN_SECRET_LENGTH = 32;

export const isProduction = process.env.NODE_ENV === "production";

/** `next build` тоже идёт с NODE_ENV=production, но работает с локальной базой. */
export const isProductionRuntime =
  isProduction && process.env.NEXT_PHASE !== "phase-production-build";

/** Демо-аккаунты (пароль из DEMO_PASSWORD в lib/demo.ts) и быстрый вход. В production — только для тестовых серверов. */
export function demoAccountsEnabled(): boolean {
  return !isProduction || process.env.ALLOW_DEMO_ACCOUNTS === "true";
}

let cachedSecret: Uint8Array | null = null;

export function getAuthSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.AUTH_SECRET;
  if (isProduction) {
    if (!raw || raw.length < MIN_SECRET_LENGTH || raw === DEV_AUTH_SECRET) {
      throw new Error(
        `AUTH_SECRET должен быть задан в production (минимум ${MIN_SECRET_LENGTH} символа, не значение по умолчанию)`,
      );
    }
  }
  cachedSecret = new TextEncoder().encode(raw || DEV_AUTH_SECRET);
  return cachedSecret;
}

export function getAppOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
