"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, KeyRound, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { Avatar, Button, Kbd, Modal, cn } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { ICONS } from "./icons";
import { MOBILE_PRIMARY, type NavGroup } from "./nav";
import { NotificationsBell } from "./notifications";
import { SearchPalette } from "./search";
import { QuickCreate, type QuickCtx } from "./quick-create";

export type ShellUser = { id: number; name: string; position: string; color: string; isOwner: boolean };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function AppShell({ user, nav, quick, vapidKey, children }: { user: ShellUser; nav: NavGroup[]; quick: QuickCtx; vapidKey: string | null; children: React.ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState(false);
  const flat = nav.flatMap((g) => g.items);
  const primary = MOBILE_PRIMARY.map((h) => flat.find((i) => i.href === h)).filter(Boolean) as typeof flat;
  useEffect(() => setMore(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* ───── Sidebar (desktop) ───── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-sidebar text-sidebar-fg lg:flex">
        <Link href="/" className="flex h-16 shrink-0 items-center gap-2.5 px-5">
          <span className="grid size-9 place-items-center rounded-xl bg-white p-1.5"><Image src="/brand/logo-mark.svg" alt="" width={24} height={24} /></span>
          <span className="leading-tight"><span className="block text-[15px] font-extrabold tracking-tight text-white">Electro Demo</span><span className="block text-[11px] font-medium text-white/50">CRM и склад</span></span>
        </Link>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4" aria-label="Основное меню">
          {nav.map((g, gi) => (
            <div key={gi} className={cn(gi > 0 && "mt-4")}>
              {g.title && <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">{g.title}</p>}
              {g.items.map((it) => {
                const Icon = ICONS[it.icon];
                const active = isActive(path, it.href);
                return (
                  <Link key={it.href} href={it.href} prefetch={false}
                    className={cn("group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors duration-150",
                      active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}>
                    {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-yellow" />}
                    <Icon className={cn("size-[18px] shrink-0", active ? "text-yellow" : "text-white/50 group-hover:text-white/80")} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <UserBlock user={user} />
      </aside>

      {/* ───── Topbar ───── */}
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 lg:hidden" title="Главная">
            <Image src="/brand/icon.svg" alt="" width={36} height={36} className="rounded-xl border border-line" priority />
            <span className="text-[15px] font-extrabold tracking-tight">DEMO</span>
          </Link>
          <button onClick={() => setSearch(true)} className="ml-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-ink-3 transition-colors hover:border-line-strong sm:w-72 lg:ml-0 lg:w-96" aria-label="Поиск товаров, клиентов, заявок">
            <Search className="size-4" /><span className="hidden sm:inline">Поиск товаров, клиентов, заявок</span><span className="ml-auto hidden lg:inline"><Kbd>Ctrl K</Kbd></span>
          </button>
          <div className="flex items-center gap-1 lg:ml-auto">
            <InstallButton />
            <ThemeToggle />
            <NotificationsBell vapidKey={vapidKey} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full min-w-0 overflow-x-clip max-w-[1440px] px-4 pb-32 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-16">{children}</main>

      {/* ───── Bottom nav (mobile) ───── */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden" aria-label="Нижнее меню">
        <div className="grid h-16 grid-cols-5">
          {primary.map((it) => {
            const Icon = ICONS[it.icon];
            const active = isActive(path, it.href);
            return (
              <Link key={it.href} href={it.href} prefetch={false} className={cn("flex flex-col items-center justify-center gap-1 text-[11px] font-semibold", active ? "text-navy dark:text-yellow" : "text-ink-3")}>
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", active && "bg-yellow-50 dark:bg-white/10")}><Icon className="size-5" /></span>
                {it.label}
              </Link>
            );
          })}
          <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-3">
            <span className="grid h-7 w-12 place-items-center"><Menu className="size-5" /></span>Ещё
          </button>
        </div>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Все разделы">
        <div className="flex flex-col gap-5">
          {nav.map((g, gi) => (
            <div key={gi}>
              {g.title && <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-3">{g.title}</p>}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.items.map((it) => {
                  const Icon = ICONS[it.icon];
                  return (
                    <Link key={it.href} href={it.href} className={cn("flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center text-xs font-semibold", isActive(path, it.href) ? "border-yellow bg-yellow-50 text-navy dark:bg-white/5 dark:text-yellow" : "border-line bg-surface text-ink-2")}>
                      <Icon className="size-5" />{it.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
            <Avatar name={user.name} color={user.color} size={40} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user.name}</p><p className="truncate text-xs text-ink-3">{user.position || (user.isOwner ? "Руководитель" : "Сотрудник")}</p></div>
            <Link href="/change-password" className="grid size-10 place-items-center rounded-xl text-ink-3 hover:bg-surface-2" aria-label="Сменить пароль"><KeyRound className="size-5" /></Link>
            <form action={logoutAction}><button className="grid size-10 place-items-center rounded-xl text-danger hover:bg-danger-bg" aria-label="Выйти"><LogOut className="size-5" /></button></form>
          </div>
        </div>
      </Modal>

      <SearchPalette open={search} onClose={() => setSearch(false)} />
      <QuickCreate ctx={quick} />
    </div>
  );
}

function UserBlock({ user }: { user: ShellUser }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/10 p-4">
      <Avatar name={user.name} color={user.color} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{user.name}</p>
        <Link href="/change-password" className="text-xs text-white/50 hover:text-white">{user.position || (user.isOwner ? "Руководитель" : "Сменить пароль")}</Link>
      </div>
      <form action={logoutAction}>
        <button className="grid size-9 place-items-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white" aria-label="Выйти" title="Выйти"><LogOut className="size-4" /></button>
      </form>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const v = !dark;
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    try { localStorage.setItem("demo-theme", v ? "dark" : "light"); } catch {}
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Светлая тема" : "Тёмная тема"} title={dark ? "Светлая тема" : "Тёмная тема"}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
function InstallButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", on);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (!evt && !ios) return null;
  return (
    <>
      <Button variant="accent" size="sm" icon={<Download className="size-4" />} className="hidden sm:inline-flex"
        onClick={async () => { if (evt) { await evt.prompt(); await evt.userChoice; setEvt(null); } else setHelp(true); }}>
        Установить приложение
      </Button>
      <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Установить приложение"
        onClick={async () => { if (evt) { await evt.prompt(); setEvt(null); } else setHelp(true); }}><Download className="size-5" /></Button>
      <Modal open={help} onClose={() => setHelp(false)} title="Установка на iPhone" size="sm">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Откройте сайт в Safari.</li>
          <li>Нажмите «Поделиться» (квадрат со стрелкой) внизу экрана.</li>
          <li>Выберите «На экран “Домой”» и нажмите «Добавить».</li>
        </ol>
      </Modal>
    </>
  );
}
