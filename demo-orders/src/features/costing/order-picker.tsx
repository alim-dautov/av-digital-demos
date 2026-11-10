"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export function OrderPicker({
  options,
  value,
}: {
  options: { number: string; label: string }[];
  value: string | null;
}) {
  const router = useRouter();
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => router.push(v === ALL ? "/costing" : `/costing?order=${encodeURIComponent(v)}`)}
    >
      <SelectTrigger className="w-full sm:w-96" aria-label="Заказ">
        <SelectValue placeholder="Выберите заказ" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={ALL}>Все заказы</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.number} value={o.number}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
