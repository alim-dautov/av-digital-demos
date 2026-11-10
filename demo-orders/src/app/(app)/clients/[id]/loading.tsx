import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function ClientLoading() {
  return (
    <PageSkeleton label="Загрузка клиента…">
      <PageHeaderSkeleton back titleWidth="w-56" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-20 rounded-xs" />
                <Skeleton className="h-4 w-28 rounded-xs" />
              </div>
            ))}
          </div>
        </CardSkeleton>
        <CardSkeleton>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-1.5 border-l-2 border-border pl-3">
                <Skeleton className="h-4 w-3/4 rounded-xs" />
                <Skeleton className="h-3 w-1/3 rounded-xs" />
              </div>
            ))}
          </div>
        </CardSkeleton>
      </div>
      <CardSkeleton bodyClassName="p-0 pt-5">
        <ListSkeleton inset rows={4} columns={5} />
      </CardSkeleton>
    </PageSkeleton>
  );
}
