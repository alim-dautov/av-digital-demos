"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { FileText, Search, User, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const KBD_CLASS =
  "rounded-xs border border-border bg-panel-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground";

type SearchResult = {
  type: "order" | "client" | "employee";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

type CommandSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const iconFor = (type: SearchResult["type"]) => {
    if (type === "order") return FileText;
    if (type === "client") return Users;
    return User;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Поиск</DialogTitle>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="bg-transparent"
        >
          <div className="flex items-center gap-2 border-b border-border pl-3 pr-12">
            <Search className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              aria-label="Поиск заказов, клиентов, сотрудников"
              className="flex h-12 w-full bg-transparent text-sm outline-none"
            />
            <kbd className={cn(KBD_CLASS, "hidden sm:inline")}>Esc</kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            {loading && (
              <div className="space-y-1" aria-busy="true" aria-label="Поиск">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="size-4 rounded-xs" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/5 rounded-xs" />
                      <Skeleton className="h-3 w-3/5 rounded-xs" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && query && results.length === 0 && (
              <Command.Empty>
                <EmptyState
                  compact
                  icon={Search}
                  title="Ничего не найдено"
                  description="Проверьте написание или попробуйте номер заказа, телефон клиента."
                />
              </Command.Empty>
            )}
            {!loading &&
              results.map((item) => {
                const Icon = iconFor(item.type);
                return (
                  <Command.Item
                    key={`${item.type}-${item.id}`}
                    value={`${item.title} ${item.subtitle}`}
                    onSelect={() => go(item.href)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none transition-colors duration-150",
                      "data-[selected=true]:bg-foreground/[0.06] data-[selected=true]:text-foreground",
                    )}
                  >
                    <Icon
                      className="size-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                    </div>
                  </Command.Item>
                );
              })}
            {!query && !loading && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Начните вводить запрос
              </p>
            )}
          </Command.List>
          <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:flex">
            <span className="flex items-center gap-1.5">
              <kbd className={KBD_CLASS}>↑</kbd>
              <kbd className={KBD_CLASS}>↓</kbd>
              выбор
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className={KBD_CLASS}>Enter</kbd>
              открыть
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className={KBD_CLASS}>Ctrl K</kbd>
              поиск
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
