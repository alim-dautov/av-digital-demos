import { Skeleton } from "@/components/ui/skeleton";

const STAGE_COUNT = 6;
const CARDS_PER_COLUMN = [1, 3, 3, 1, 1, 3];

export default function ProductionLoading() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка производства…</span>

      <header className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-md sm:h-9" />
        <Skeleton className="h-4 w-20 rounded-xs" />
      </header>

      <section className="rounded-lg border border-border bg-panel p-4 sm:p-5">
        <Skeleton className="h-4 w-40 rounded-xs" />
        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 sm:gap-x-6 sm:gap-y-4 xl:grid-cols-6">
          {Array.from({ length: STAGE_COUNT }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20 max-w-full rounded-xs" />
              <Skeleton className="h-6 w-8 rounded-xs" />
            </div>
          ))}
        </div>
      </section>

      <Skeleton className="h-4 w-80 max-w-full rounded-xs" />

      <div className="-mx-4 flex gap-4 overflow-hidden px-4 pb-2 sm:-mx-6 sm:px-6">
        {CARDS_PER_COLUMN.map((count, col) => (
          <div key={col} className="flex w-[280px] shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <Skeleton className="h-4 w-28 rounded-xs" />
              <Skeleton className="h-3 w-4 rounded-xs" />
            </div>
            <div className="min-h-40 space-y-2 rounded-lg bg-foreground/[0.03] p-1.5">
              {Array.from({ length: count }, (_, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-border bg-panel p-3"
                >
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-16 rounded-xs" />
                    <Skeleton className="h-3 w-16 rounded-xs" />
                  </div>
                  <Skeleton className="h-3 w-24 rounded-xs" />
                  <Skeleton className="h-4 w-full rounded-xs" />
                  <Skeleton className="h-4 w-2/3 rounded-xs" />
                  <div className="flex justify-between pt-1">
                    <Skeleton className="h-3 w-20 rounded-xs" />
                    <Skeleton className="h-3 w-24 rounded-xs" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
