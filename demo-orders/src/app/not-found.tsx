import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="font-mono text-sm tabular-nums text-muted-foreground">404</p>
      <div className="max-w-md space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Такой страницы нет
        </h1>
        <p className="text-sm text-muted-foreground">
          Проверьте адрес или вернитесь на главную Mebel Demo.
        </p>
      </div>
      <Button asChild>
        <Link href="/">На главную</Link>
      </Button>
    </main>
  );
}
