"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PushSettings } from "@/features/notifications/push-settings";
import { cn, formatDateRu, formatTimeRu } from "@/lib/utils";
import type { Notification } from "@/types";

type NotificationsPanelProps = {
  notifications: Notification[];
};

export function NotificationsPanel({ notifications }: NotificationsPanelProps) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);

  useEffect(() => {
    setItems(notifications);
  }, [notifications]);

  const unread = items.filter((n) => !n.read).length;

  async function markOne(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } catch {
      /* ignore */
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      router.refresh();
    } catch {
      /* ignore */
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Уведомления"
        >
          <Bell className="size-[18px]" strokeWidth={1.5} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0">Уведомления</DropdownMenuLabel>
          {unread > 0 && (
            <button
              type="button"
              className="rounded-xs text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={markAll}
            >
              Прочитать все
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <PushSettings variant="compact" />
        <ScrollArea className="h-[320px]">
          {items.length === 0 ? (
            <EmptyState
              compact
              icon={Bell}
              title="Нет уведомлений"
              description="Здесь появятся новые заказы, задачи и напоминания."
              className="py-12"
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {items.map((n) => {
                const content = (
                  <div
                    className={cn(
                      "px-4 py-3 transition-colors duration-150 hover:bg-foreground/[0.04]",
                      !n.read && "bg-primary/[0.04]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {n.title}
                      </p>
                      {!n.read && (
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                          aria-label="Не прочитано"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                      {formatDateRu(n.createdAt)} · {formatTimeRu(n.createdAt)}
                    </p>
                  </div>
                );

                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        className="block"
                        onClick={() => {
                          if (!n.read) void markOne(n.id);
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="block w-full text-left"
                        onClick={() => {
                          if (!n.read) void markOne(n.id);
                        }}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
