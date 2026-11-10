import { Skeleton } from "@/components/ui/skeleton";

const FUNNEL_STEPS = 7;
const COLUMN_COUNT = 4;
const CARDS_PER_COLUMN = 3;

export default function OrdersLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка заказов…</span>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 rounded-md sm:h-9" />
          <Skeleton className="h-4 w-28 rounded-xs" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-10 w-36 rounded-md" />
        </div>
      </header>

      <section className="rounded-lg border border-border bg-panel p-4 sm:p-5">
        <Skeleton className="mb-3 h-4 w-20 rounded-xs" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: FUNNEL_STEPS }, (_, i) => (
            <div key={i} className="flex min-w-[92px] flex-1 flex-col items-center gap-2">
              <Skeleton className="h-4 w-6 rounded-xs" />
              <Skeleton className="h-14 w-full max-w-10 rounded-b-none rounded-t-sm" />
              <Skeleton className="h-3 w-14 rounded-xs" />
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-3 overflow-hidden pb-2">
        {Array.from({ length: COLUMN_COUNT }, (_, col) => (
          <div
            key={col}
            className="flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-panel"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <Skeleton className="h-4 w-24 rounded-xs" />
              <Skeleton className="h-5 w-7 rounded-sm" />
            </div>
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: CARDS_PER_COLUMN }, (_, i) => (
                <div key={i} className="space-y-2 rounded-lg bg-panel-elevated p-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-14 rounded-xs" />
                    <Skeleton className="h-3 w-20 rounded-xs" />
                  </div>
                  <Skeleton className="h-4 w-3/4 rounded-xs" />
                  <Skeleton className="h-3 w-full rounded-xs" />
                  <div className="flex justify-between pt-1">
                    <Skeleton className="h-3 w-20 rounded-xs" />
                    <Skeleton className="h-3 w-16 rounded-xs" />
                  </div>
                  <Skeleton className="h-8 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
