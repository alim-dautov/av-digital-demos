import * as React from "react";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  trend?: number;
  period?: string;
}

function KpiCard({
  className,
  label,
  value,
  icon: Icon,
  trend,
  period = "к пред. периоду",
  ...props
}: KpiCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className={cn("@container overflow-hidden", className)} {...props}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            <p className="truncate text-xl font-semibold tracking-tight text-foreground tabular-nums @[11rem]:text-2xl">
              {value}
            </p>
            {trend !== undefined && (
              <p
                className={cn(
                  "flex flex-wrap items-center gap-x-1 text-xs font-medium",
                  isPositive ? "text-success" : "text-destructive",
                )}
              >
                <TrendIcon className="size-3.5" aria-hidden />
                <span className="tabular-nums">{formatPercent(trend)}</span>
                <span className="font-normal text-muted-foreground">
                  {period}
                </span>
              </p>
            )}
          </div>
          {Icon && (
            <div className="hidden size-9 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary @[15rem]:flex">
              <Icon className="size-[18px]" aria-hidden />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { KpiCard };
