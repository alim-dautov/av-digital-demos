import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

function PageSkeleton({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-6", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function PageHeaderSkeleton({
  back = false,
  action = false,
  titleWidth = "w-44",
}: {
  back?: boolean;
  action?: boolean;
  titleWidth?: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {back && <Skeleton className="mb-3 h-8 w-28 rounded-md" />}
        <Skeleton className={cn("h-8 rounded-md sm:h-9", titleWidth)} />
        <Skeleton className="h-4 w-56 max-w-full rounded-xs" />
      </div>
      {action && <Skeleton className="h-10 w-36 rounded-md" />}
    </header>
  );
}

function KpiGridSkeleton({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {range(count).map((i) => (
        <div key={i} className="rounded-lg border border-border bg-panel p-4 sm:p-5">
          <Skeleton className="h-3.5 w-24 rounded-xs" />
          <Skeleton className="mt-2 h-7 w-28 rounded-xs" />
        </div>
      ))}
    </div>
  );
}

function FiltersSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Skeleton className="h-10 flex-1 rounded-md" />
      <Skeleton className="h-10 w-full rounded-md sm:w-[200px]" />
    </div>
  );
}

function TabsSkeleton({ count }: { count: number }) {
  return (
    <div className="flex gap-1 overflow-hidden rounded-md bg-panel-elevated p-1">
      {range(count).map((i) => (
        <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-sm" />
      ))}
    </div>
  );
}

/** Mirrors `MobileList` below `md` and a table from `md` up. */
function ListSkeleton({
  rows,
  columns = 5,
  inset = false,
}: {
  rows: number;
  columns?: number;
  inset?: boolean;
}) {
  const frame = inset ? "" : "rounded-lg border border-border bg-panel";
  return (
    <>
      <ul className={cn("divide-y divide-border md:hidden", frame, inset && "border-t border-border")}>
        {range(rows).map((i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5 rounded-xs" />
              <Skeleton className="h-3 w-3/4 rounded-xs" />
            </div>
            <Skeleton className="h-4 w-20 rounded-xs" />
          </li>
        ))}
      </ul>
      <div className={cn("hidden md:block", frame)}>
        <div className="flex h-11 items-center gap-6 border-b border-border px-4">
          {range(columns).map((c) => (
            <Skeleton key={c} className="h-3 flex-1 rounded-xs" />
          ))}
        </div>
        {range(rows).map((r) => (
          <div
            key={r}
            className="flex h-[53px] items-center gap-6 border-b border-border px-4 last:border-0"
          >
            {range(columns).map((c) => (
              <Skeleton
                key={c}
                className={cn("h-4 flex-1 rounded-xs", c === 0 ? "max-w-48" : "max-w-28")}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function CardSkeleton({
  className,
  bodyClassName,
  children,
}: {
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-panel", className)}>
      <div className="space-y-2 p-5 pb-0">
        <Skeleton className="h-5 w-36 rounded-xs" />
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

export {
  PageSkeleton,
  PageHeaderSkeleton,
  KpiGridSkeleton,
  FiltersSkeleton,
  TabsSkeleton,
  ListSkeleton,
  CardSkeleton,
};
