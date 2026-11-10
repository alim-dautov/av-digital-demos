import type { DB } from "@/db";
import { auditLog } from "@/db/schema";
import type { Principal } from "./rbac";

export async function audit(db: DB, p: Principal | null, action: string, entity: string, entityId: string | number | null, summary: string, data?: unknown) {
  await db.insert(auditLog).values({
    userId: p?.id ?? null, tokenId: p?.tokenId ?? null, action, entity,
    entityId: entityId == null ? null : String(entityId), summary, data: (data ?? null) as never,
  });
}
