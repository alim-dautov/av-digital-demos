import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function ReportsLoading() {
  return (
    <PageSkeleton label="Загрузка отчётов…">
      <PageHeaderSkeleton titleWidth="w-32" />
      <CardSkeleton>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-20 rounded-md sm:col-span-2" />
        </div>
      </CardSkeleton>
      <div className="space-y-3">
        <Skeleton className="h-5 w-36 rounded-xs" />
        <ListSkeleton rows={5} columns={5} />
      </div>
    </PageSkeleton>
  );
}
