import { cn } from "@/lib/utils";

/** Red counter on a menu item, e.g. new orders in «Цех». */
export function NavBadge({ count, className }: { count?: number; className?: string }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold leading-6 text-white tabular-nums",
        className,
      )}
      aria-label={`Новых: ${count}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
