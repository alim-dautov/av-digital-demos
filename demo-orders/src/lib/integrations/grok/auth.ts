import { createHash, timingSafeEqual } from "node:crypto";

export const GROK_TOKEN_ENV = "GROK_CONNECTOR_TOKEN";
const MIN_TOKEN_LENGTH = 32;

export type GrokAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Proves that a request comes from the integration. It never identifies the user:
 * the acting user is resolved and checked separately for every request.
 */
export interface GrokAuthAdapter {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  verify(request: Request): GrokAuthResult;
}

function configuredToken(): string | null {
  const raw = process.env[GROK_TOKEN_ENV]?.trim();
  return raw && raw.length >= MIN_TOKEN_LENGTH ? raw : null;
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const bearerTokenAdapter: GrokAuthAdapter = {
  id: "bearer",
  label: "Статический токен (Authorization: Bearer)",
  isConfigured: () => configuredToken() !== null,
  verify(request) {
    const expected = configuredToken();
    if (!expected) {
      return { ok: false, status: 503, error: "Интеграция не подключена" };
    }
    const header = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match || !sameSecret(match[1].trim(), expected)) {
      return { ok: false, status: 401, error: "Неверный токен интеграции" };
    }
    return { ok: true };
  },
};

export function getGrokAuthAdapter(): GrokAuthAdapter {
  return bearerTokenAdapter;
}
