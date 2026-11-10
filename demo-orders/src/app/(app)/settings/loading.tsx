import { Skeleton } from "@/components/ui/skeleton";
import {
  CardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TabsSkeleton,
} from "@/components/ui/page-skeleton";

export default function SettingsLoading() {
  return (
    <PageSkeleton label="Загрузка настроек…">
      <PageHeaderSkeleton action titleWidth="w-40" />
      <div className="space-y-4">
        <TabsSkeleton count={7} />
        <CardSkeleton>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={i === 2 ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                <Skeleton className="h-3.5 w-24 rounded-xs" />
                <Skeleton className="h-10 rounded-md" />
              </div>
            ))}
          </div>
        </CardSkeleton>
      </div>
    </PageSkeleton>
  );
}
