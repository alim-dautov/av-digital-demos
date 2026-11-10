import { getData, mutateDataLocked } from "@/lib/db";
import { nowIso } from "@/lib/utils";
import type { AppData, GrokConnectorMode, GrokConnectorSettings } from "@/types";
import { DEFAULT_COMMANDS, ENABLEABLE_COMMANDS } from "./commands";

export function defaultGrokSettings(companyId: string): GrokConnectorSettings {
  return {
    companyId,
    enabled: false,
    mode: "test",
    allowedCommands: [...DEFAULT_COMMANDS],
    allowedUserIds: [],
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    lastCheckAt: null,
    lastCheckOk: null,
    updatedAt: nowIso(),
  };
}

export function getGrokSettings(companyId: string, data: AppData = getData()): GrokConnectorSettings {
  return data.grokConnectors.find((s) => s.companyId === companyId) ?? defaultGrokSettings(companyId);
}

/** Returns the stored record, creating it inside an open mutation if needed. */
export function grokSettingsInData(data: AppData, companyId: string): GrokConnectorSettings {
  let settings = data.grokConnectors.find((s) => s.companyId === companyId);
  if (!settings) {
    settings = defaultGrokSettings(companyId);
    data.grokConnectors.push(settings);
  }
  return settings;
}

export type GrokSettingsPatch = {
  enabled?: boolean;
  mode?: GrokConnectorMode;
  allowedCommands?: string[];
  allowedUserIds?: string[];
};

export function updateGrokSettings(companyId: string, patch: GrokSettingsPatch): GrokConnectorSettings {
  return mutateDataLocked((data) => {
    const settings = grokSettingsInData(data, companyId);
    if (patch.enabled !== undefined) settings.enabled = patch.enabled;
    if (patch.mode !== undefined) settings.mode = patch.mode;
    if (patch.allowedCommands) {
      settings.allowedCommands = [...new Set(patch.allowedCommands)].filter((c) =>
        ENABLEABLE_COMMANDS.includes(c),
      );
    }
    if (patch.allowedUserIds) {
      const active = new Set(
        data.users.filter((u) => u.isActive && u.companyId === companyId).map((u) => u.id),
      );
      settings.allowedUserIds = [...new Set(patch.allowedUserIds)].filter((id) => active.has(id));
    }
    settings.updatedAt = nowIso();
    return { ...settings };
  });
}

export type GrokStatus = "disconnected" | "connected" | "error";

export const GROK_STATUS_LABELS: Record<GrokStatus, string> = {
  disconnected: "Не подключена",
  connected: "Подключена",
  error: "Ошибка",
};

export function grokStatus(settings: GrokConnectorSettings, tokenConfigured: boolean): GrokStatus {
  if (!settings.enabled || !tokenConfigured) return "disconnected";
  if (settings.lastErrorAt && (!settings.lastSuccessAt || settings.lastErrorAt > settings.lastSuccessAt)) {
    return "error";
  }
  return settings.lastSuccessAt ? "connected" : "disconnected";
}

export type GrokCheck = { label: string; ok: boolean };

/** Local readiness check; it does not call Grok. */
export function checkGrokConnection(companyId: string, tokenConfigured: boolean) {
  const settings = getGrokSettings(companyId);
  const checks: GrokCheck[] = [
    { label: "Токен задан в окружении сервера", ok: tokenConfigured },
    { label: "Интеграция включена", ok: settings.enabled },
    { label: "Выбран хотя бы один пользователь", ok: settings.allowedUserIds.length > 0 },
    { label: "Разрешена хотя бы одна команда", ok: settings.allowedCommands.length > 0 },
  ];
  const ok = checks.every((c) => c.ok);
  const at = nowIso();
  mutateDataLocked((data) => {
    const stored = grokSettingsInData(data, companyId);
    stored.lastCheckAt = at;
    stored.lastCheckOk = ok;
  });
  return { ok, at, checks };
}
