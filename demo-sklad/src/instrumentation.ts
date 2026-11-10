/**
 * Фоновый планировщик: каждые 5 минут — сроки задач, зависшие лиды, напоминания.
 * Отключается DISABLE_SCHEDULER=1 (например, если запущено несколько инстансов и проверки дёргает внешний cron через POST /api/cron).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  if (process.env.DB_AUTO_SETUP === "1") {
    try {
      await (await import("./db/setup")).autoSetup();
    } catch (e) {
      console.error("[setup]", e);
    }
  }
  if (process.env.DISABLE_SCHEDULER === "1") return;
  const g = globalThis as unknown as { __demoScheduler?: NodeJS.Timeout };
  if (g.__demoScheduler) return;
  const tick = async () => {
    try {
      const [{ getDb }, { runChecks }] = await Promise.all([import("./db"), import("./modules/scheduler/checks")]);
      await runChecks(await getDb());
    } catch (e) {
      console.error("[scheduler]", e);
    }
  };
  g.__demoScheduler = setInterval(tick, 5 * 60_000);
  g.__demoScheduler.unref?.();
  setTimeout(tick, 30_000).unref?.();
}
