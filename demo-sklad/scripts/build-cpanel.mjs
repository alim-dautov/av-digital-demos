/**
 * Сборка пакета для виртуального хостинга cPanel (Setup Node.js App + FTP).
 * Результат: dist/cpanel/ (залить по FTP) и dist/demo-cpanel.zip (залить и распаковать в File Manager).
 * Запуск: npm run build:cpanel
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const out = path.join(dist, "cpanel");

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

console.log("› next build (standalone, без оптимизации изображений)");
run("npm", ["run", "build"], { NEXT_IMAGES_UNOPTIMIZED: "1", NEXT_TELEMETRY_DISABLED: "1" });

rmSync(dist, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log("› сборка пакета");
cpSync(path.join(root, ".next", "standalone"), out, { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
for (const d of ["public", "assets", "drizzle"]) cpSync(path.join(root, d), path.join(out, d), { recursive: true });
cpSync(path.join(root, "deploy", "cpanel", "app.cjs"), path.join(out, "app.cjs"));
cpSync(path.join(root, "deploy", "cpanel", "env.example"), path.join(out, "env.example"));
cpSync(path.join(root, "deploy", "cpanel", "cron.cjs"), path.join(out, "cron.cjs"));

// Ничего локального и секретного в пакет: env-файлы, локальная база, вложения, Windows-бинарники sharp
for (const f of readdirSync(out)) if (f.startsWith(".env")) rmSync(path.join(out, f), { force: true });
for (const p of [".data", "uploads", "dist", ".next-portal-test", "demo-brand", "tests", "node_modules/sharp", "node_modules/@img"])
  rmSync(path.join(out, p), { recursive: true, force: true });
mkdirSync(path.join(out, "uploads"), { recursive: true });
writeFileSync(path.join(out, "uploads", ".keep"), "");
mkdirSync(path.join(out, "tmp"), { recursive: true });
writeFileSync(path.join(out, "tmp", "restart.txt"), "");

const size = (p) => statSync(p).isDirectory() ? readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0) : statSync(p).size;
console.log(`› dist/cpanel: ${(size(out) / 1048576).toFixed(1)} МБ`);

// Метка перезапуска: Passenger перезапускает приложение, когда меняется tmp/restart.txt
writeFileSync(path.join(out, "tmp", "restart.txt"), new Date().toISOString());

// CI (GitHub Actions) заливает папку по FTP, архив не нужен
if (process.env.SKIP_ZIP === "1") { console.log("✓ готово (без архива)"); process.exit(0); }

console.log("› архив dist/demo-cpanel.zip");
const zip = path.join(dist, "demo-cpanel.zip");
// На Windows — системный bsdtar (умеет zip), а не GNU tar из Git Bash
const winTar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const tar = process.platform === "win32" && existsSync(winTar) ? winTar : "tar";
const r = spawnSync(tar, ["-a", "-cf", path.relative(out, zip), "."], { stdio: "inherit", cwd: out });
if (r.status !== 0 || !existsSync(zip)) console.warn("! не удалось создать zip — залейте папку dist/cpanel по FTP целиком");
else console.log(`✓ готово: ${(statSync(zip).size / 1048576).toFixed(1)} МБ`);
