/**
 * Запуск проверок CRM (POST /api/cron) из планировщика хостинга. Секрет берётся из .env рядом с файлом,
 * поэтому в панели хостинга его вводить не нужно. Заодно не даёт приложению засыпать.
 * Команда для планировщика (каждые 5 минут): node /путь/к/demo-crm/cron.cjs
 * Переменные: CRON_TARGET (по умолчанию http://127.0.0.1), CRON_HOST (по умолчанию хост из APP_URL).
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

const env = {};
const file = path.join(__dirname, ".env");
if (fs.existsSync(file))
  for (const raw of fs.readFileSync(file, "utf8").replace(/^\s*/, "").split(/\r?\n/)) {
    const i = raw.indexOf("=");
    if (i > 0 && !raw.trim().startsWith("#")) env[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
  }

const secret = env.CRON_SECRET;
if (!secret) { console.error("CRON_SECRET не задан в .env"); process.exit(1); }
const host = env.CRON_HOST || new URL(env.APP_URL || "http://localhost").host;
const target = new URL("/api/cron", env.CRON_TARGET || "http://127.0.0.1");

const req = (target.protocol === "https:" ? https : http).request(target, {
  method: "POST",
  headers: { host, "x-cron-secret": secret, "content-length": 0 },
  timeout: 120_000,
}, (res) => {
  let body = "";
  res.on("data", (c) => (body += c));
  res.on("end", () => {
    console.log(new Date().toISOString(), res.statusCode, body.slice(0, 200));
    process.exitCode = res.statusCode === 200 ? 0 : 1;
  });
});
req.on("timeout", () => req.destroy(new Error("timeout")));
req.on("error", (e) => { console.error(new Date().toISOString(), e.message); process.exitCode = 1; });
req.end();
