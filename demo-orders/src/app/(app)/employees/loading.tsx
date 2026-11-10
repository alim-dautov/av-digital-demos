import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, PageSkeleton } from "@/components/ui/page-skeleton";

export default function EmployeesLoading() {
  return (
    <PageSkeleton label="Загрузка сотрудников…">
      <PageHeaderSkeleton titleWidth="w-44" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-panel p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40 rounded-xs" />
                <Skeleton className="h-3.5 w-24 rounded-xs" />
              </div>
              <Skeleton className="h-5 w-16 rounded-sm" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-sm" />
              <Skeleton className="h-5 w-16 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
