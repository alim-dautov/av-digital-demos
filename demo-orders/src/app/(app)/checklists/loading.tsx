import {
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/ui/page-skeleton";

export default function ChecklistsLoading() {
  return (
    <PageSkeleton label="Загрузка чек-листов…">
      <PageHeaderSkeleton titleWidth="w-40" />
      <ListSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
