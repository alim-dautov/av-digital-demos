import {
  KpiGridSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TabsSkeleton,
} from "@/components/ui/page-skeleton";

export default function InventoryLoading() {
  return (
    <PageSkeleton label="Загрузка склада…">
      <PageHeaderSkeleton action titleWidth="w-28" />
      <KpiGridSkeleton count={3} className="sm:grid-cols-3" />
      <div className="space-y-4">
        <TabsSkeleton count={4} />
        <ListSkeleton rows={6} columns={6} />
      </div>
    </PageSkeleton>
  );
}
