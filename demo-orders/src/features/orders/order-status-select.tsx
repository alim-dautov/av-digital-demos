"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnyOrderStatus, OrderStatus } from "@/types";
import {
  ORDER_STATUS_LABELS,
  ATELIER_ORDER_STATUS_LABELS,
  ATELIER_SELECTABLE_STATUSES,
} from "@/types";
import { cn } from "@/lib/utils";

const FURNITURE = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

export function OrderStatusSelect({
  orderId,
  status,
  disabled,
  className,
  size = "default",
  textiles,
  id,
  "aria-label": ariaLabel,
}: {
  id?: string;
  "aria-label"?: string;
  orderId: string;
  status: AnyOrderStatus;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
  textiles?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const statuses = textiles ? ATELIER_SELECTABLE_STATUSES : FURNITURE;
  const labels = textiles ? ATELIER_ORDER_STATUS_LABELS : ORDER_STATUS_LABELS;

  useEffect(() => {
    setValue(status);
  }, [status]);

  async function onChange(next: string) {
    const prev = value;
    setValue(next as AnyOrderStatus);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setValue(prev);
        toast.error(data.error ?? "Не удалось сменить статус");
        return;
      }
      toast.success("Статус обновлён");
      startTransition(() => router.refresh());
    } catch {
      setValue(prev);
      toast.error("Ошибка сети");
    }
  }

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled || pending}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(size === "sm" && "min-h-12 text-base", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => (
          <SelectItem key={s} value={s}>
            {(labels as Record<string, string>)[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
