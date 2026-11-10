import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => {
  const s = process.env.APP_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("APP_SECRET не задан");
  return s || "dev-secret-change-me";
};

/** Подписанная ссылка: base64url(payload).подпись. Используется для публичных КП и актов сверки. */
export function signLink(payload: Record<string, unknown>, days: number) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * 86400000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 32);
  return `${body}.${sig}`;
}

export function verifyLink<T = Record<string, unknown>>(token: string): (T & { exp: number }) | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expect = createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 32);
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
