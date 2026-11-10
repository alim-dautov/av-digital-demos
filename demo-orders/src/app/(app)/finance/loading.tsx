import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  KpiGridSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function FinanceLoading() {
  return (
    <PageSkeleton label="Загрузка финансов…" className="pb-8">
      <PageHeaderSkeleton titleWidth="w-36" />
      <KpiGridSkeleton count={3} className="gap-4 sm:grid-cols-3" />
      <div className="grid gap-4 lg:grid-cols-5">
        <CardSkeleton className="lg:col-span-3" bodyClassName="space-y-6 p-5">
          <Skeleton className="h-[240px] rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 rounded-xs" />
            <Skeleton className="h-[180px] rounded-md" />
          </div>
        </CardSkeleton>
        <CardSkeleton className="lg:col-span-2" bodyClassName="space-y-5 p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28 rounded-xs" />
                  <Skeleton className="h-4 w-24 rounded-xs" />
                </div>
                <Skeleton className="h-1.5 rounded-full" />
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32 rounded-xs" />
              <Skeleton className="h-4 w-24 rounded-xs" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-36 rounded-xs" />
              <Skeleton className="h-4 w-24 rounded-xs" />
            </div>
          </div>
        </CardSkeleton>
      </div>
    </PageSkeleton>
  );
}
