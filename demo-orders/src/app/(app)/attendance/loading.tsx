import { Skeleton } from "@/components/ui/skeleton";
import {
  KpiGridSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function AttendanceLoading() {
  return (
    <PageSkeleton label="Загрузка посещаемости…">
      <PageHeaderSkeleton action titleWidth="w-48" />
      <KpiGridSkeleton count={2} className="grid-cols-2 sm:gap-4" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-48 rounded-xs" />
        <ListSkeleton rows={6} columns={4} />
      </div>
    </PageSkeleton>
  );
}
