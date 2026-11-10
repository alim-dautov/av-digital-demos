import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const KPI_COUNT = 5;
const ATTENTION_ROWS = 3;
const STAGE_COUNT = 6;
const RECENT_ROWS = 6;
const TASK_ROWS = 4;

function CardHeaderSkeleton({ withLink = true }: { withLink?: boolean }) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36 rounded-xs" />
        <Skeleton className="h-4 w-48 rounded-xs" />
      </div>
      {withLink && <Skeleton className="h-8 w-16 rounded-md" />}
    </CardHeader>
  );
}

function ListRowSkeleton({ trailing = "w-16" }: { trailing?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/5 rounded-xs" />
        <Skeleton className="h-3 w-2/5 rounded-xs" />
      </div>
      <Skeleton className={cn("h-5 shrink-0 rounded-xs", trailing)} />
    </li>
  );
}

export default function AppLoading() {
  return (
    <div className="space-y-6 pb-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка…</span>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36 rounded-xs" />
          <Skeleton className="h-8 w-64 rounded-md sm:h-9" />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Skeleton className="h-4 w-28 rounded-xs" />
          <Skeleton className="h-4 w-32 rounded-xs" />
          <Skeleton className="h-4 w-24 rounded-xs" />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: KPI_COUNT }, (_, i) => (
          <Card
            key={i}
            className={cn(i === KPI_COUNT - 1 && "col-span-2 lg:col-span-1")}
          >
            <CardContent className="space-y-3 p-4 sm:p-5">
              <Skeleton className="h-3.5 w-24 rounded-xs" />
              <Skeleton className="h-8 w-20 rounded-xs" />
              <Skeleton className="h-3 w-28 rounded-xs" />
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-40 rounded-xs" />
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, col) => (
            <div key={col} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-32 rounded-xs" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
              <ul className="divide-y divide-border">
                {Array.from({ length: ATTENTION_ROWS }, (_, i) => (
                  <ListRowSkeleton key={i} />
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36 rounded-xs" />
              <Skeleton className="h-4 w-48 rounded-xs" />
            </div>
            <Skeleton className="h-8 w-56 rounded-md" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[432px] w-full rounded-md" />
          </CardContent>
        </Card>
        <Card>
          <CardHeaderSkeleton withLink={false} />
          <CardContent className="flex flex-col items-center gap-4 pt-2">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-3.5 w-48 rounded-xs" />
            <div className="flex w-full flex-wrap justify-center gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-32 rounded-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeaderSkeleton />
        <CardContent>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: STAGE_COUNT }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3.5 w-24 rounded-xs" />
                  <Skeleton className="h-3.5 w-6 rounded-xs" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeaderSkeleton />
          <CardContent>
            <ul className="divide-y divide-border">
              {Array.from({ length: RECENT_ROWS }, (_, i) => (
                <ListRowSkeleton key={i} trailing="w-20" />
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeaderSkeleton />
          <CardContent>
            <ul className="divide-y divide-border">
              {Array.from({ length: TASK_ROWS }, (_, i) => (
                <ListRowSkeleton key={i} trailing="w-12" />
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
