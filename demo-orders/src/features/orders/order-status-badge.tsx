import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnyOrderStatus, OrderStatus, AtelierOrderStatus } from "@/types";
import {
  ORDER_STATUS_LABELS,
  ATELIER_ORDER_STATUS_LABELS,
} from "@/types";

const FURNITURE_VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  lead: "secondary",
  application: "outline",
  contract: "default",
  approval: "warning",
  production: "default",
  installation: "warning",
  closed: "success",
};

const ATELIER_VARIANT: Record<
  AtelierOrderStatus,
  "default" | "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  draft: "secondary",
  measurement: "outline",
  awaiting: "warning",
  in_work: "default",
  completed: "success",
  cancelled: "destructive",
};

export function OrderStatusBadge({
  status,
  className,
  textiles,
}: {
  status: AnyOrderStatus;
  className?: string;
  textiles?: boolean;
}) {
  if (textiles || status in ATELIER_ORDER_STATUS_LABELS) {
    const s = status as AtelierOrderStatus;
    if (ATELIER_ORDER_STATUS_LABELS[s]) {
      return (
        <Badge variant={ATELIER_VARIANT[s]} className={cn(className)}>
          {ATELIER_ORDER_STATUS_LABELS[s]}
        </Badge>
      );
    }
  }
  const s = status as OrderStatus;
  return (
    <Badge variant={FURNITURE_VARIANT[s] ?? "outline"} className={cn(className)}>
      {ORDER_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}
