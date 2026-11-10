import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, PageSkeleton } from "@/components/ui/page-skeleton";

export default function TasksLoading() {
  return (
    <PageSkeleton label="Загрузка задач…">
      <PageHeaderSkeleton action titleWidth="w-32" />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-10 w-full rounded-md sm:w-[200px]" />
        <Skeleton className="h-10 w-full rounded-md sm:w-[200px]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-56 max-w-full rounded-xs" />
                <Skeleton className="h-5 w-16 rounded-sm" />
                <Skeleton className="h-5 w-20 rounded-sm" />
              </div>
              <Skeleton className="h-3.5 w-3/4 rounded-xs" />
              <div className="flex gap-4">
                <Skeleton className="h-3 w-24 rounded-xs" />
                <Skeleton className="h-3 w-28 rounded-xs" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
