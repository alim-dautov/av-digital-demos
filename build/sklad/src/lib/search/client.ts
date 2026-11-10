"use client";
/**
 * Связь страницы с поисковым воркером. Один воркер на вкладку; поиск без debounce —
 * запрос уходит на каждый символ, устаревшие ответы отбрасываются.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FromWorker, HitOf, MatchLine, MatchResult, SearchKind, SearchOpts, SearchResult, SearchStatus, ToWorker } from "./types";

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (v: unknown) => void>();
let status: SearchStatus = { state: "idle", products: 0, counterparties: 0, syncedAt: null, canCreateProduct: false, priceTypes: [] };
const subs = new Set<() => void>();

function send(m: ToWorker) { worker?.postMessage(m); }

export function startSearch(userId: number) {
  if (typeof window === "undefined" || worker) return;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "demo-search" });
  } catch { return; }
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === "status") { status = m.status; subs.forEach((f) => f()); return; }
    const r = waiting.get(m.id);
    if (r) { waiting.delete(m.id); r(m.result); }
  };
  send({ type: "init", userId });
  const resync = () => send({ type: "sync" });
  window.addEventListener("focus", resync);
  window.addEventListener("online", resync);
  window.addEventListener("demo:data-changed", resync);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resync(); });
  setInterval(resync, 60_000);
  (window as unknown as { __demoSearch: unknown }).__demoSearch = { bench, search, status: () => status };
}

/** Сообщить, что данные поменялись (сохранили товар, провели приёмку…) — индекс подтянет изменения */
export function notifyDataChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("demo:data-changed"));
}

/** Очистить кэш поиска (выход, смена пользователя) */
export function clearSearchCache() {
  if (worker) send({ type: "clear" });
  else try { indexedDB.deleteDatabase("demo-search"); } catch { /* нет IndexedDB */ }
}

function call<T>(build: (id: number) => ToWorker): Promise<T> {
  if (!worker) return Promise.resolve(null as T);
  const id = ++seq;
  return new Promise<T>((res) => { waiting.set(id, res as (v: unknown) => void); send(build(id)); });
}

export function search<K extends SearchKind>(kind: K, q: string, opts: SearchOpts = {}) {
  return call<SearchResult<K> | null>((id) => ({ type: "search", id, kind, q, opts }));
}
export function matchLines(lines: MatchLine[], opts: SearchOpts = {}) {
  return call<MatchResult[] | null>((id) => ({ type: "match", id, lines, opts }));
}
export function loadClientHistory(cpId: number) { send({ type: "history", cpId }); }
export function bench(n = 5000) { return call<{ n: number; buildMs: number; p50: number; p95: number; max: number }>((id) => ({ type: "bench", id, n })); }

export function useSearchStatus() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => status, () => status);
}

/* ───── недавно выбранные (на устройстве) ───── */
const RECENT_KEY = (k: SearchKind) => `demo:recent:${k}`;
export function recentIds(kind: SearchKind): number[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY(kind)) ?? "[]") as number[]; } catch { return []; }
}
export function rememberPick(kind: SearchKind, id: number) {
  try { localStorage.setItem(RECENT_KEY(kind), JSON.stringify([id, ...recentIds(kind).filter((x) => x !== id)].slice(0, 12))); } catch { /* приватный режим */ }
}

/* ───── хук ───── */
type Perf = { last: number; samples: number[] };
const perf: Perf = { last: 0, samples: [] };
if (typeof window !== "undefined") (window as unknown as { __demoSearchPerf: Perf }).__demoSearchPerf = perf;

/**
 * Мгновенный поиск: каждый символ → воркер → результат. Возвращает элементы и время «клавиша → отрисовка».
 * `typedAt` — отметка времени нажатия (performance.now()), чтобы замерить полный отклик.
 */
export function useInstantSearch<K extends SearchKind>(kind: K, q: string, opts: SearchOpts & { enabled?: boolean } = {}) {
  const st = useSearchStatus();
  const [res, setRes] = useState<{ q: string; items: SearchResult<K>["items"]; total: number; ms: number } | null>(null);
  const typedAt = useRef(0);
  const last = useRef(0);
  const key = JSON.stringify([opts.cpId, opts.cpKind, opts.limit, opts.salesOnly, opts.recent]);
  useEffect(() => {
    if (opts.enabled === false) return;
    const my = ++last.current;
    void search(kind, q, opts).then((r) => { if (r && my === last.current) setRes({ q, items: r.items, total: r.total, ms: r.ms }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, q, key, opts.enabled, st.syncedAt, st.state]);
  useLayoutEffect(() => {
    if (!res || !typedAt.current) return;
    const ms = performance.now() - typedAt.current;
    typedAt.current = 0;
    perf.last = ms;
    perf.samples.push(ms);
    if (perf.samples.length > 500) perf.samples.shift();
  }, [res]);
  return {
    items: (res?.items ?? []) as (HitOf<K> & { group?: "recent" | "client" | "popular" })[],
    total: res?.total ?? 0,
    resultQ: res?.q ?? null,
    ready: st.state === "ready" || st.state === "offline",
    status: st,
    markTyped: () => { typedAt.current = performance.now(); },
  };
}
