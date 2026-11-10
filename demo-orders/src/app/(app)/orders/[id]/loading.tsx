import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const HEADER_STATS = 4;
const TAB_COUNT = 8;
const META_ITEMS = 3;

export default function OrderDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка заказа…</span>

      <div className="space-y-4">
        <Skeleton className="h-8 w-28 rounded-md" />
        <div className="flex flex-col gap-5 rounded-lg border border-border bg-panel p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-48 rounded-md sm:h-9" />
                <Skeleton className="h-5 w-24 rounded-sm" />
              </div>
              <Skeleton className="h-4 w-64 rounded-xs" />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              {Array.from({ length: HEADER_STATS }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16 rounded-xs" />
                  <Skeleton className="h-4 w-24 rounded-xs" />
                </div>
              ))}
            </div>
          </div>
          <div className="w-full space-y-2 lg:max-w-xs">
            <Skeleton className="h-4 w-14 rounded-xs" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: TAB_COUNT }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-sm" />
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24 rounded-xs" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full rounded-xs" />
            <Skeleton className="h-4 w-4/5 rounded-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: META_ITEMS }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16 rounded-xs" />
                <Skeleton className="h-4 w-28 rounded-xs" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
