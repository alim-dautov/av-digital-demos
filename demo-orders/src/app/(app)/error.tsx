"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-11 items-center justify-center rounded-md bg-destructive/12 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <div className="max-w-md space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Не удалось загрузить раздел
        </h1>
        <p className="text-sm text-muted-foreground">
          Попробуйте ещё раз. Если ошибка повторяется, передайте администратору
          код ниже.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">
            {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>Повторить</Button>
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
