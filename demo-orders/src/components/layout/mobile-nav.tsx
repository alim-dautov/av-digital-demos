"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  Calculator,
  CheckSquare,
  ClipboardList,
  Factory,
  FileText,
  Home,
  Landmark,
  ListChecks,
  Mic,
  MoreHorizontal,
  QrCode,
  Settings,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
  Percent,
  CalendarDays,
  Images,
  FileSignature,
  ShoppingCart,
  Scissors,
} from "lucide-react";
import { toAppPathname } from "@/lib/company-apps";
import {
  getNavForUser,
  MOBILE_PRIMARY_HREFS,
  type NavIconName,
  type NavItem,
} from "@/lib/nav";
import { NavBadge } from "@/components/layout/nav-badge";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CompanyVertical, SessionUser } from "@/types";

const ICONS: Record<NavIconName, LucideIcon> = {
  Home,
  ClipboardList,
  Users,
  Calculator,
  Factory,
  Warehouse,
  UserCog,
  Wallet,
  CheckSquare,
  FileText,
  Landmark,
  ListChecks,
  Settings,
  BarChart3,
  Mic,
  QrCode,
  Percent,
  CalendarDays,
  Images,
  FileSignature,
  ShoppingCart,
  Scissors,
};

const PRIMARY_SLOTS = 4;

const BAR_ITEM_CLASS =
  "touch-manipulation relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-sm font-medium transition-none active:bg-primary/30";

type MobileNavProps = {
  user: SessionUser;
  pathname: string;
  badges?: Record<string, number>;
  companyVertical?: CompanyVertical;
};

function isActive(pathname: string, href: string) {
  const path = toAppPathname(pathname);
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

function pickPrimary(items: NavItem[]): NavItem[] {
  const preferred = MOBILE_PRIMARY_HREFS.map((href) =>
    items.find((item) => item.href === href),
  ).filter((item): item is NavItem => Boolean(item));
  const rest = items.filter((item) => !preferred.includes(item));
  return [...preferred, ...rest].slice(0, PRIMARY_SLOTS);
}

export function MobileNav({
  user,
  pathname,
  companyVertical = "furniture",
  badges = {},
}: MobileNavProps) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [armed, setArmed] = React.useState<{ href: string; pathname: string } | null>(null);
  const items = getNavForUser(user, companyVertical);
  const primary = pickPrimary(items);
  const hasMore = items.length > primary.length;
  const activeInMore =
    !primary.some((item) => isActive(pathname, item.href)) &&
    items.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Основная навигация"
        className="mobile-nav-shell material z-40 border-t border-foreground/[0.06] md:hidden"
      >
        <ul
          className="grid h-full px-1 pt-1"
          style={{
            gridTemplateColumns: `repeat(${primary.length + (hasMore ? 1 : 0)}, minmax(0, 1fr))`,
          }}
        >
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            const pressed = armed?.href === item.href && armed.pathname === pathname;
            const Icon = ICONS[item.icon];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch
                  onPointerDown={() => setArmed({ href: item.href, pathname })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    BAR_ITEM_CLASS,
                    active || pressed
                      ? "bg-primary/20 font-semibold text-primary"
                      : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
                  )}
                >
                  {(active || pressed) && (
                    <span
                      className="absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                  <span className="relative">
                    <Icon className="size-6" aria-hidden />
                    <NavBadge count={badges[item.href]} className="absolute -right-4 -top-2" />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
          {hasMore && (
            <li>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  BAR_ITEM_CLASS,
                  moreOpen || activeInMore
                    ? "bg-primary/20 font-semibold text-primary"
                    : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
                )}
              >
                {activeInMore && (
                  <span
                    className="absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-full bg-primary"
                    aria-hidden
                  />
                )}
                <span className="relative">
                  <MoreHorizontal className="size-6" aria-hidden />
                  <NavBadge
                    count={items
                      .filter((i) => !primary.includes(i))
                      .reduce((sum, i) => sum + (badges[i.href] ?? 0), 0)}
                    className="absolute -right-4 -top-2"
                  />
                </span>
                Ещё
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="flex max-h-[80dvh] flex-col rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Навигация</SheetTitle>
          </SheetHeader>
          <ul className="mt-4 grid min-h-0 grid-cols-2 gap-2 overflow-y-auto overscroll-contain pb-4">
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              const pressed = armed?.href === item.href && armed.pathname === pathname;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch
                    onPointerDown={() => setArmed({ href: item.href, pathname })}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "touch-manipulation flex min-h-14 items-center gap-3 rounded-lg px-3 py-3 text-base transition-none active:bg-primary/30",
                      active || pressed
                        ? "bg-primary/20 font-semibold text-primary"
                        : "bg-panel-elevated text-foreground [@media(hover:hover)]:hover:bg-foreground/10",
                    )}
                  >
                    <Icon className="size-6 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <NavBadge count={badges[item.href]} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
