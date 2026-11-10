import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type MobileListProps = React.HTMLAttributes<HTMLUListElement> & {
  "aria-label": string;
  /** Hide from `md` up, where the matching table takes over. */
  mobileOnly?: boolean;
  /** Render inside an existing card: no own border, background or radius. */
  inset?: boolean;
};

function MobileList({ className, mobileOnly = true, inset = false, ...props }: MobileListProps) {
  return (
    <ul
      className={cn(
        "divide-y divide-border",
        inset
          ? "border-t border-border"
          : "overflow-hidden rounded-lg border border-border bg-panel",
        mobileOnly && "md:hidden",
        className,
      )}
      {...props}
    />
  );
}

type MobileListItemProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  value?: React.ReactNode;
  valueMeta?: React.ReactNode;
  leading?: React.ReactNode;
  href?: string;
  className?: string;
  actions?: React.ReactNode;
};

function MobileListItem({
  title,
  subtitle,
  meta,
  value,
  valueMeta,
  leading,
  href,
  className,
  actions,
}: MobileListItemProps) {
  const body = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        {subtitle && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</div>
        )}
        {meta && (
          <div className="mt-1 text-xs tabular-nums text-muted-foreground">{meta}</div>
        )}
      </div>
      {(value || valueMeta) && (
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {value && (
            <div className="text-sm font-medium tabular-nums text-foreground">{value}</div>
          )}
          {valueMeta && <div className="text-xs text-muted-foreground">{valueMeta}</div>}
        </div>
      )}
    </>
  );

  const rowClass = cn("flex items-start gap-3 px-4 py-3", className);

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            rowClass,
            "transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] focus-visible:outline-none active:bg-foreground/[0.06]",
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
      {actions ? <div className="px-4 pb-3">{actions}</div> : null}
    </li>
  );
}

export { MobileList, MobileListItem };
