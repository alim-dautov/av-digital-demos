import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "../auth-forms";
import { SearchCacheReset } from "@/components/search-boot";
import { isDemo } from "@/lib/demo";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { demoLoginAction } from "../actions";

/** Страница входа индексируется (визитка), всё остальное — noindex */
export const metadata = { title: "Вход", robots: { index: true, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getSessionUser();
  if (u) redirect(u.mustChangePassword ? "/change-password" : "/");
  const { next } = await searchParams;
  const demoUsers = isDemo() ? await (await getDb()).select({ login: users.login, name: users.name, position: users.position }).from(users).where(and(isNull(users.deletedAt), eq(users.active, true))).orderBy(asc(users.id)) : [];
  return (
    <>
      <h2 className="text-[28px] font-extrabold tracking-tight">Вход в систему</h2>
      <p className="mb-8 mt-1.5 text-sm text-ink-3">{isDemo() ? "Это демонстрационная система с выдуманными данными." : "Логин и временный пароль выдаёт руководитель."}</p>
      {demoUsers.length > 0 && (
        <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="mb-1 text-sm font-bold">Демо-версия</p>
          <p className="mb-3 text-xs">Данные выдуманные. Выберите роль и войдите одним нажатием — пароль не нужен.</p>
          <div className="flex flex-col gap-2">
            {demoUsers.map((d) => (
              <form key={d.login} action={demoLoginAction}>
                <input type="hidden" name="login" value={d.login} />
                <button type="submit" className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2.5 text-left text-sm font-semibold shadow-sm ring-1 ring-amber-200 hover:bg-amber-100">
                  <span>{d.name}</span><span className="text-xs font-normal text-amber-800">{d.position}</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      )}
      {demoUsers.length === 0 && <LoginForm next={next} />}
      <SearchCacheReset />
    </>
  );
}
