/**
 * Точка входа для cPanel «Setup Node.js App» (Application startup file: app.cjs).
 * Подгружает переменные из .env рядом с файлом (если не заданы в панели) и запускает сервер Next.js.
 */
const fs = require("node:fs");
const path = require("node:path");

process.chdir(__dirname);

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, "utf8").replace(/^\s*/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

process.env.NODE_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";
// На Linux HOSTNAME содержит имя машины — Next.js пытался бы слушать его. Passenger сам перехватывает listen().
process.env.HOSTNAME = process.env.APP_HOST || "127.0.0.1";
if (!process.env.STORAGE_LOCAL_DIR) process.env.STORAGE_LOCAL_DIR = path.join(__dirname, "uploads");

// server.js — ES-модуль; динамический import работает из CommonJS на любой версии Node, которую поддерживает Passenger
import("./server.js").catch((e) => {
  console.error("[start]", e);
  process.exit(1);
});
