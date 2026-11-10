"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logoutDevice } from "@/lib/push-client";

export function CompanyDenied({ name, slug }: { name: string; slug: string }) {
  const router = useRouter();

  async function logout() {
    await logoutDevice();
    router.replace(`/c/${slug}/login`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-panel p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          У этой учётной записи нет доступа к компании. Войдите под пользователем {name}.
        </p>
        <Button className="mt-5" type="button" onClick={() => void logout()}>
          Выйти
        </Button>
      </div>
    </main>
  );
}
