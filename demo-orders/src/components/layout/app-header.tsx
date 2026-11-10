"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { CommandSearch } from "@/components/layout/command-search";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { logoutDevice } from "@/lib/push-client";
import { ROLE_LABELS, type Company, type Notification, type SessionUser } from "@/types";

type AppHeaderProps = {
  user: SessionUser;
  companies: Company[];
  notifications: Notification[];
  onMenuClick?: () => void;
};

export function AppHeader({
  user,
  companies,
  notifications,
  onMenuClick,
}: AppHeaderProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const initials = user.fullName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function logout() {
    await logoutDevice();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border material px-3 pt-safe sm:h-16 sm:gap-3 sm:px-5">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Меню"
        >
          <Menu className="size-5" strokeWidth={1.5} />
        </Button>

        <CompanySwitcher
          companies={companies}
          activeCompanyId={user.companyId}
        />

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            variant="outline"
            className="hidden h-9 gap-2 border-border bg-panel-elevated px-3 text-muted-foreground sm:inline-flex"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-4" strokeWidth={1.5} />
            <span className="text-sm">Поиск…</span>
            <kbd className="ml-2 rounded-xs border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px]">
              Ctrl K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Поиск"
          >
            <Search className="size-[18px]" strokeWidth={1.5} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Сменить тему"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-[18px] rotate-0 scale-100 transition-transform duration-200 ease-out-quart dark:-rotate-90 dark:scale-0" strokeWidth={1.5} aria-hidden />
            <Moon className="absolute size-[18px] rotate-90 scale-0 transition-transform duration-200 ease-out-quart dark:rotate-0 dark:scale-100" strokeWidth={1.5} aria-hidden />
          </Button>

          <NotificationsPanel notifications={notifications} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-10 gap-2 px-1.5 sm:px-2"
              >
                <Avatar className="h-8 w-8">
                  {user.avatarUrl ? (
                    <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                  ) : null}
                  <AvatarFallback className="bg-primary/15 text-xs text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden min-w-0 text-left lg:block">
                  <p className="truncate text-sm font-medium leading-none">
                    {user.fullName}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {ROLE_LABELS[user.role]}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="font-medium">{user.fullName}</p>
                <p className="text-xs font-normal text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void logout();
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" strokeWidth={1.5} />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
