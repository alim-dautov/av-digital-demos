import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  KpiGridSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function AnalyticsLoading() {
  return (
    <PageSkeleton label="Загрузка аналитики…">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeaderSkeleton titleWidth="w-40" />
        <Skeleton className="h-10 w-80 max-w-full rounded-md" />
      </div>
      <KpiGridSkeleton count={6} className="gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" />
      <div className="grid gap-4 lg:grid-cols-5">
        <CardSkeleton className="lg:col-span-3">
          <Skeleton className="h-72 rounded-md" />
        </CardSkeleton>
        <CardSkeleton className="lg:col-span-2">
          <Skeleton className="mx-auto size-56 rounded-full" />
        </CardSkeleton>
      </div>
      <CardSkeleton bodyClassName="p-0 pt-5 md:px-5 md:pb-5">
        <ListSkeleton inset rows={4} columns={6} />
      </CardSkeleton>
    </PageSkeleton>
  );
}
