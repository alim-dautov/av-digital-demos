"use client";

import { useEffect, useState } from "react";
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
  Percent,
  QrCode,
  Settings,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  CalendarDays,
  Images,
  FileSignature,
  ShoppingCart,
  Scissors,
  type LucideIcon,
} from "lucide-react";
import { getCompanyLogo, toAppPathname } from "@/lib/company-apps";
import { ASSISTANT_NAV, getNavForUser, type NavIconName } from "@/lib/nav";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { NavBadge } from "@/components/layout/nav-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

type AppSidebarProps = {
  user: SessionUser;
  pathname: string;
  companyName?: string;
  companyLogoUrl?: string | null;
  companyTagline?: string;
  companyVertical?: CompanyVertical;
  badges?: Record<string, number>;
  open?: boolean;
  onClose?: () => void;
};

function isActive(pathname: string, href: string) {
  const path = toAppPathname(pathname);
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

function SidebarBody({
  user,
  pathname,
  companyName = "Mebel Demo",
  companyLogoUrl,
  companyTagline = "мебель на заказ",
  companyVertical = "furniture",
  compact = false,
  badges = {},
  onNavigate,
}: {
  user: SessionUser;
  pathname: string;
  companyName?: string;
  companyLogoUrl?: string | null;
  companyTagline?: string;
  companyVertical?: CompanyVertical;
  compact?: boolean;
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const items = getNavForUser(user, companyVertical);
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    setArmed(null);
  }, [pathname]);
  const showAssistant =
    can(user, ASSISTANT_NAV.resource) && companyVertical === "furniture";
  const logo = companyLogoUrl ? { full: { src: companyLogoUrl, width: 200, height: 100 }, mark: { src: companyLogoUrl, width: 100, height: 100 } } : companyLogoUrl === null ? null : getCompanyLogo(user.companyId);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "border-b border-border px-4 py-5",
          compact && "px-2 py-4 text-center",
        )}
      >
        {compact && logo ? (
          <img
            src={logo.mark.src}
            width={logo.mark.width}
            height={logo.mark.height}
            alt={companyName}
            className="mx-auto h-10 w-auto"
          />
        ) : compact ? (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-md bg-primary/12 text-sm font-semibold text-primary">
            {companyName.trim().charAt(0).toUpperCase() || "T"}
          </div>
        ) : logo ? (
          <>
            <img
              src={logo.full.src}
              width={logo.full.width}
              height={logo.full.height}
              alt={companyName}
              className="mx-auto max-h-24 w-full max-w-[200px] object-contain"
            />
            <p className="mt-2 text-center text-sm font-medium">{companyName}</p>
          </>
        ) : (
          <>
            <div>
              <p className="text-base font-semibold tracking-tight text-primary">
                {companyName}
              </p>
              <p className="text-xs text-muted-foreground">{companyTagline}</p>
            </div>
          </>
        )}
      </div>

      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            const pressed = armed === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                onPointerDown={() => setArmed(item.href)}
                onClick={onNavigate}
                title={compact ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "touch-manipulation flex min-h-[52px] items-center gap-3 rounded-lg px-3 text-base transition-none active:bg-primary/35",
                  compact && "justify-center px-0",
                  active || pressed
                    ? "bg-primary/25 font-semibold text-primary"
                    : "text-foreground [@media(hover:hover)]:hover:bg-foreground/10",
                )}
              >
                <span className="relative shrink-0">
                  <Icon className="size-6" aria-hidden />
                  {compact && (
                    <NavBadge count={badges[item.href]} className="absolute -right-3 -top-2" />
                  )}
                </span>
                {!compact && <span className="flex-1">{item.label}</span>}
                {!compact && <NavBadge count={badges[item.href]} />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {showAssistant && (
        <div
          className={cn(
            "mt-auto border-t border-border p-3",
            compact && "px-2",
          )}
        >
          <Link
            href={ASSISTANT_NAV.href}
            prefetch
            onPointerDown={() => setArmed(ASSISTANT_NAV.href)}
            onClick={onNavigate}
            className={cn(
              "touch-manipulation flex min-h-[52px] items-center gap-3 rounded-lg px-3 text-base text-foreground transition-none active:bg-primary/35",
              compact && "justify-center px-0",
              (isActive(pathname, ASSISTANT_NAV.href) || armed === ASSISTANT_NAV.href) &&
                "bg-primary/25 font-semibold text-primary",
            )}
            title={compact ? ASSISTANT_NAV.label : undefined}
            aria-current={
              isActive(pathname, ASSISTANT_NAV.href) ? "page" : undefined
            }
          >
            <Mic className="size-6 shrink-0" />
            {!compact && <span>{ASSISTANT_NAV.label}</span>}
          </Link>
          {!compact && (
            <Link
              href={ASSISTANT_NAV.href}
              onClick={onNavigate}
              className="touch-manipulation mt-2 flex min-h-14 items-center gap-3 rounded-lg bg-panel-elevated px-3 py-3 text-base transition-none active:bg-primary/20 [@media(hover:hover)]:hover:bg-foreground/10"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/12 text-primary">
                <Mic className="size-4" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">
                  Скажите, что нужно
                </p>
                <p className="text-xs text-muted-foreground">
                  Голосовой ассистент
                </p>
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({
  user,
  pathname,
  companyName,
  companyLogoUrl,
  companyTagline,
  companyVertical,
  badges,
  open,
  onClose,
}: AppSidebarProps) {
  return (
    <>
      {/* Desktop / tablet fixed rail */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-[280px] border-r border-border bg-panel md:flex md:flex-col"
      >
        <SidebarBody
          badges={badges}
          user={user}
          pathname={pathname}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          companyTagline={companyTagline}
          companyVertical={companyVertical}
        />
      </aside>

      {/* Mobile sheet */}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose?.();
        }}
      >
        <SheetContent side="left" className="w-[300px] p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Навигация</SheetTitle>
          </SheetHeader>
          <SidebarBody
          badges={badges}
            user={user}
            pathname={pathname}
            companyName={companyName}
            companyLogoUrl={companyLogoUrl}
            companyTagline={companyTagline}
            companyVertical={companyVertical}
            onNavigate={onClose}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
