/**
 * Замок «один процесс на папку PGlite». PGlite не защищает данные от записи из двух процессов,
 * а на виртуальном хостинге Passenger может поднять второй экземпляр приложения (при перезапуске
 * или под нагрузкой). Владелец замка — процесс, чей pid записан в <dir>.lock; если этот процесс
 * умер (kill -9, сбой), замок считается брошенным и забирается.
 */
import fs from "node:fs";

export class DbBusyError extends Error {
  code = "EDBBUSY";
  constructor(public owner: number) {
    super(`База PGlite открыта другим процессом (pid ${owner})`);
  }
}

function alive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwner(file: string) {
  try {
    return Number.parseInt(fs.readFileSync(file, "utf8"), 10);
  } catch {
    return NaN;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Пытается забрать замок один раз. Возвращает true, если он наш. */
async function tryAcquire(file: string): Promise<boolean | number> {
  try {
    const fd = fs.openSync(file, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const owner = readOwner(file);
  if (owner === process.pid) return true;
  if (alive(owner)) return owner;
  // Брошенный замок: перезаписываем своим pid и через паузу проверяем, что нас не опередил
  // другой процесс, забиравший его одновременно (последний записавший побеждает, остальные отступают).
  fs.writeFileSync(file, String(process.pid));
  await sleep(150);
  const now = readOwner(file);
  return now === process.pid ? true : now;
}

/**
 * Ждёт замок до waitMs (старый процесс при перезапуске успевает закрыться) и бросает DbBusyError,
 * если папку так и держит живой процесс. Возвращает функцию освобождения.
 */
export async function acquireDirLock(dir: string, waitMs = Number(process.env.PGLITE_LOCK_WAIT_MS ?? 30_000)) {
  const file = `${dir}.lock`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const r = await tryAcquire(file);
    if (r === true) break;
    if (Date.now() >= deadline) throw new DbBusyError(r as number);
    await sleep(250);
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off("exit", release);
    try {
      if (readOwner(file) === process.pid) fs.unlinkSync(file);
    } catch {
      /* уже удалён */
    }
  };
  process.on("exit", release);
  return release;
}
