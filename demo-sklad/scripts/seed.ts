import { mkdir, writeFile } from "node:fs/promises";
import { getDb, migrateDb, closeDb } from "../src/db";
import { seed } from "../src/db/seed";
await migrateDb();
const db = await getDb();
const res = await seed(db, { demo: process.env.SEED_DEMO !== "0", password: process.env.SEED_PASSWORD || undefined });
if (res.skipped) console.log("БД уже заполнена — seed пропущен");
else {
  const lines = Object.entries(res.passwords).map(([l, p]) => `${l.padEnd(10)} ${p}`).join("\n");
  await mkdir(".data", { recursive: true });
  await writeFile(".data/initial-passwords.txt", `Временные пароли (обязательная смена при первом входе)\n\n${lines}\n`);
  console.log("✓ Seed выполнен. Временные пароли сохранены в .data/initial-passwords.txt");
}
await closeDb();
