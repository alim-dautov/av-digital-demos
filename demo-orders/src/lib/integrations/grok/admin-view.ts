import { getData } from "@/lib/db";
import { getAppOrigin } from "@/lib/env";
import type { GrokConnectorSettings, GrokLogEntry, UserRole } from "@/types";
import { getGrokAuthAdapter } from "./auth";
import { grokCatalog, type GrokCommandInfo } from "./commands";
import { GROK_ENDPOINT_PATH } from "./endpoint";
import { listGrokLogs } from "./log";
import { getGrokSettings, grokStatus, type GrokStatus } from "./settings";

export type GrokAdminView = {
  status: GrokStatus;
  endpoint: string;
  auth: { method: string; tokenConfigured: boolean };
  settings: GrokConnectorSettings;
  commands: GrokCommandInfo[];
  users: { id: string; fullName: string; role: UserRole }[];
  logs: GrokLogEntry[];
  errors: GrokLogEntry[];
};

/** Everything the settings screen needs. The token value is never included. */
export function grokAdminView(companyId: string): GrokAdminView {
  const adapter = getGrokAuthAdapter();
  const tokenConfigured = adapter.isConfigured();
  const settings = getGrokSettings(companyId);
  return {
    status: grokStatus(settings, tokenConfigured),
    endpoint: `${getAppOrigin() ?? ""}${GROK_ENDPOINT_PATH}`,
    auth: { method: adapter.label, tokenConfigured },
    settings,
    commands: grokCatalog(),
    users: getData()
      .users.filter((u) => u.isActive && u.companyId === companyId)
      .map((u) => ({ id: u.id, fullName: u.fullName, role: u.role }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")),
    logs: listGrokLogs(companyId, { limit: 30 }),
    errors: listGrokLogs(companyId, { errorsOnly: true, limit: 30 }),
  };
}
