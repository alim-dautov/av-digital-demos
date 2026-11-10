"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
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
    <html lang="ru" className="dark">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center font-sans text-foreground">
        <title>Ошибка · Mebel Demo</title>
        <h1 className="text-2xl font-semibold tracking-tight">
          Приложение не загрузилось
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Обновите страницу. Если не поможет, сообщите администратору
          {error.digest ? ` код ${error.digest}` : ""}.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Повторить
        </button>
      </body>
    </html>
  );
}
