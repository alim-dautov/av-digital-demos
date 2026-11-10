import { fileResponse, withUser } from "@/lib/http";
import { today } from "@/lib/format";
import { backupDump } from "@/modules/settings/service";

export const GET = withUser(async (_req, { db, p }) => {
  const dump = await backupDump(db, p);
  return fileResponse(Buffer.from(JSON.stringify(dump)), `demo-backup-${today()}.json`, "application/json");
});
