import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-11 items-center justify-center rounded-md bg-panel-elevated text-muted-foreground">
        <SearchX className="size-5" />
      </div>
      <div className="max-w-md space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Запись не найдена
        </h1>
        <p className="text-sm text-muted-foreground">
          Возможно, её удалили или ссылка устарела. Найти нужное можно через
          поиск (Ctrl K) или из списка.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">На главную</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/orders">К заказам</Link>
        </Button>
      </div>
    </div>
  );
}
