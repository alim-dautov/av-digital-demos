import {
  KpiGridSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function CostingLoading() {
  return (
    <PageSkeleton label="Загрузка себестоимости…">
      <PageHeaderSkeleton titleWidth="w-52" />
      <KpiGridSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
      <ListSkeleton rows={6} columns={7} />
    </PageSkeleton>
  );
}
