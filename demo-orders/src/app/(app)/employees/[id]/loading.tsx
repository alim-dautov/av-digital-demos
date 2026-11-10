import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

function FieldsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-20 rounded-xs" />
          <Skeleton className="h-4 w-28 rounded-xs" />
        </div>
      ))}
    </div>
  );
}

export default function EmployeeLoading() {
  return (
    <PageSkeleton label="Загрузка сотрудника…">
      <PageHeaderSkeleton back titleWidth="w-60" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton>
          <FieldsSkeleton count={4} />
        </CardSkeleton>
        <CardSkeleton>
          <FieldsSkeleton count={3} />
        </CardSkeleton>
      </div>
      <CardSkeleton bodyClassName="p-0 pt-5">
        <ListSkeleton inset rows={3} columns={4} />
      </CardSkeleton>
      <CardSkeleton bodyClassName="p-0 pt-5">
        <ListSkeleton inset rows={5} columns={4} />
      </CardSkeleton>
    </PageSkeleton>
  );
}
