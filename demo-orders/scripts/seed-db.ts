import fs from "fs";
import { getDataPath, resetData } from "../src/lib/db/store";
import { ensureDatabase } from "../src/lib/db/seed";

const filePath = getDataPath();
if (fs.existsSync(filePath)) {
  fs.unlinkSync(filePath);
  console.log("Deleted", filePath);
}

resetData();
ensureDatabase();
console.log("Seeded", filePath);
