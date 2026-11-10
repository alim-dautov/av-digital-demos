import type { OrderStatusChange, AtelierOrderStatus } from "@/types";
import { ATELIER_ORDER_STATUS_LABELS } from "@/types";

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Almaty",
});

export function formatDateTimeRu(iso: string): string {
  return dateTime.format(new Date(iso));
}

function label(status: string | null) {
  if (!status) return null;
  return ATELIER_ORDER_STATUS_LABELS[status as AtelierOrderStatus] ?? status;
}

export function StatusHistory({ history }: { history: OrderStatusChange[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">Изменений статуса пока нет</p>;
  }
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {[...history].reverse().map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative text-sm">
          <span
            aria-hidden
            className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary"
          />
          <p className="font-medium text-foreground">
            {h.from ? `${label(h.from)} → ${label(h.status)}` : label(h.status)}
          </p>
          <p className="text-xs text-muted-foreground">
            {h.actorName} · <time dateTime={h.at}>{formatDateTimeRu(h.at)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
