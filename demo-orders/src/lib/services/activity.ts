import { getData, mutateData } from "@/lib/db";
import { generateId, nowIso } from "@/lib/utils";
import type { ActivityLog } from "@/types";

export function listActivity(
  companyId: string,
  limit = 50,
): ActivityLog[] {
  return getData()
    .activityLog.filter((a) => a.companyId === companyId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export function listActivityForEntity(
  companyId: string,
  entityType: string,
  entityId: string,
  limit = 50,
): ActivityLog[] {
  return getData()
    .activityLog.filter(
      (a) =>
        a.companyId === companyId &&
        a.entityType === entityType &&
        a.entityId === entityId,
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export function logActivity(input: {
  companyId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
}): ActivityLog {
  const entry: ActivityLog = {
    id: generateId("act"),
    companyId: input.companyId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    createdAt: nowIso(),
  };
  mutateData((data) => {
    data.activityLog.unshift(entry);
  });
  return entry;
}
