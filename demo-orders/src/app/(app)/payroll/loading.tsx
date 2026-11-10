import {
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TabsSkeleton,
} from "@/components/ui/page-skeleton";

export default function PayrollLoading() {
  return (
    <PageSkeleton label="Загрузка зарплат…">
      <PageHeaderSkeleton titleWidth="w-36" />
      <div className="space-y-4">
        <TabsSkeleton count={4} />
        <ListSkeleton rows={6} columns={8} />
      </div>
    </PageSkeleton>
  );
}
