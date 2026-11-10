import {
  FiltersSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function ClientsLoading() {
  return (
    <PageSkeleton label="Загрузка клиентов…">
      <PageHeaderSkeleton action titleWidth="w-36" />
      <FiltersSkeleton />
      <ListSkeleton rows={8} columns={6} />
    </PageSkeleton>
  );
}
