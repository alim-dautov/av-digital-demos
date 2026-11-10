"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { toAppPathname } from "@/lib/company-apps";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { RouteProgress } from "@/components/layout/route-progress";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAddButton } from "@/features/quick-add/quick-add-button";
import { cn } from "@/lib/utils";
import type { Company, Notification, SessionUser } from "@/types";

type AppShellProps = {
  user: SessionUser;
  companies: Company[];
  notifications: Notification[];
  /** Counters shown next to menu items, keyed by href */
  navBadges?: Record<string, number>;
  companyStatus: Company["status"];
  companyName: string;
  companyTagline: string;
  companyVertical: Company["vertical"];
  companyLocked?: boolean;
  children: React.ReactNode;
};

export function AppShell({
  user,
  companies,
  notifications,
  navBadges = {},
  companyStatus,
  companyName,
  companyTagline,
  companyVertical,
  companyLocked = false,
  children,
}: AppShellProps) {
  const pathname = toAppPathname(usePathname());
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const showPlaceholder =
    companyStatus === "coming_soon" &&
    !pathname.startsWith("/settings") &&
    pathname !== "/company-placeholder";
  const showQuickAdd = pathname === "/" && !showPlaceholder;

  return (
    <div className="min-h-dvh bg-canvas">
      <RouteProgress pathname={pathname} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Перейти к содержимому
      </a>
      <AppSidebar
        user={user}
        pathname={pathname}
        companyName={companyName}
        companyLogoUrl={companies.find((company) => company.id === user.companyId)?.logoUrl}
        companyTagline={companyTagline}
        companyVertical={companyVertical}
        badges={navBadges}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="md:pl-[280px]">
        <AppHeader
          user={user}
          companies={companies}
          notifications={notifications}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "min-h-[calc(100dvh-3.5rem)] px-4 py-5 mobile-content-padding outline-none sm:min-h-[calc(100dvh-4rem)] sm:px-6 sm:py-6 md:pb-10",
            showQuickAdd && "mobile-content-padding-quick md:pb-28",
          )}
        >
          <div className="mx-auto w-full max-w-[1440px]">
            {showPlaceholder ? (
              <EmptyState
                title="Модуль компании находится в разработке"
                description={
                  companyLocked
                    ? "Этот модуль ещё в разработке."
                    : "Выберите активную компанию или откройте настройки, чтобы продолжить работу."
                }
                action={
                  companyLocked
                    ? undefined
                    : { label: "Открыть настройки", href: "/settings" }
                }
                className="min-h-[50dvh]"
              />
            ) : (
              children
            )}
          </div>
        </main>
      </div>

      <MobileNav
        user={user}
        pathname={pathname}
        companyVertical={companyVertical}
        badges={navBadges}
      />
      {showQuickAdd && <QuickAddButton user={user} />}
    </div>
  );
}
