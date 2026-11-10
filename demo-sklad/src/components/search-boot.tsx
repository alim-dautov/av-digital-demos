"use client";
import { useEffect } from "react";
import { clearSearchCache, startSearch } from "@/lib/search/client";

/** Запускает поисковый воркер после входа (индекс из IndexedDB + синхронизация) */
export function SearchBoot({ userId }: { userId: number }) {
  useEffect(() => { startSearch(userId); }, [userId]);
  return null;
}

/** На странице входа кэш поиска стирается: на общем устройстве цены прошлого сотрудника не остаются */
export function SearchCacheReset() {
  useEffect(() => { clearSearchCache(); }, []);
  return null;
}
