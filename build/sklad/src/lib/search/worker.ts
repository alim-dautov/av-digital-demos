/// <reference lib="webworker" />
/**
 * Web Worker мгновенного поиска: держит индекс в памяти, кэширует его в IndexedDB,
 * сам синхронизируется с сервером дельтами (/api/index?since=…). Поток страницы не блокируется никогда.
 */
import { SearchIndex, type IndexDoc, type RankCtx } from "./engine";
import { phoneDigits } from "./text";
import type { IdxCp, IdxProduct, IndexPayload } from "@/modules/search/service";
import type { CpHit, FromWorker, MatchResult, ProductHit, SearchKind, SearchOpts, SearchResult, SearchStatus, SimpleHit, ToWorker } from "./types";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromWorker) => ctx.postMessage(m);

/* ───── состояние ───── */
type State = {
  v: 1; userId: number; now: number; permKey: string;
  canProducts: boolean; canCreateProduct: boolean; canCounterparties: boolean;
  priceTypes: IndexPayload["priceTypes"]; folders: IndexPayload["folders"]; users: IndexPayload["users"]; synonyms: string[][];
  products: IdxProduct[]; cps: IdxCp[]; pStats: IndexPayload["pStats"]; cStats: IndexPayload["cStats"];
};
let userId = 0;
let st: State | null = null;
let syncing: Promise<void> | null = null;
let lastSync = 0;
let online = true;
let failed = false;

const P = new Map<number, IdxProduct>();
const C = new Map<number, IdxCp>();
const pStat = new Map<number, [number, number]>(); // остаток, продажи
const cStat = new Map<number, [number, number]>(); // долг клиента, наш долг
const folderName = new Map<number, string>();
const hist = new Map<number, Map<number, number>>(); // cpId → товар → раз
let pIdx = new SearchIndex();
let cIdx = new SearchIndex();
let uIdx = new SearchIndex();
let fIdx = new SearchIndex();

const SEG: Record<string, string> = { bazaar: "базар", shop: "магазин", install: "электромонтаж монтаж", other: "" };

function rebuild() {
  if (!st) return;
  P.clear(); C.clear(); pStat.clear(); cStat.clear(); folderName.clear();
  for (const f of st.folders) folderName.set(f.id, f.name);
  for (const p of st.products) P.set(p.id, p);
  for (const c of st.cps) C.set(c.id, c);
  for (const [id, q, pop] of st.pStats) pStat.set(id, [q, pop]);
  for (const [id, cd, od] of st.cStats) cStat.set(id, [cd, od]);
  const pDocs: IndexDoc[] = st.products.map((p) => ({ id: p.id, fields: [
    { text: p.n, w: 1 }, { text: p.sku, w: 0.92, code: true }, { text: p.bc, w: 0.92, code: true }, { text: p.f ? folderName.get(p.f) : null, w: 0.55 },
  ] }));
  const cDocs: IndexDoc[] = st.cps.map((c) => ({ id: c.id, fields: [
    { text: c.n, w: 1 }, { text: phoneDigits(c.ph), w: 0.9, phone: true }, { text: c.wa && c.wa !== c.ph ? phoneDigits(c.wa) : null, w: 0.9, phone: true },
    { text: c.tags.join(" "), w: 0.7 }, { text: SEG[c.seg] ?? "", w: 0.5 }, { text: c.bin, w: 0.85, code: true },
  ] }));
  pIdx = new SearchIndex(pDocs, st.synonyms);
  cIdx = new SearchIndex(cDocs);
  uIdx = new SearchIndex(st.users.map((u) => ({ id: u.id, fields: [{ text: u.name, w: 1 }] })));
  fIdx = new SearchIndex(st.folders.map((f) => ({ id: f.id, fields: [{ text: f.name, w: 1 }, { text: f.parentId ? folderName.get(f.parentId) : null, w: 0.5 }] })));
  status();
}

function status() {
  const s: SearchStatus = {
    state: !st ? (failed ? "error" : "loading") : online ? "ready" : "offline",
    products: st?.products.length ?? 0, counterparties: st?.cps.length ?? 0, syncedAt: st?.now ?? null,
    canCreateProduct: st?.canCreateProduct ?? false, priceTypes: st?.priceTypes ?? [],
  };
  post({ type: "status", status: s });
}

/* ───── IndexedDB ───── */
const DB_NAME = "demo-search";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise((res) => { const r = db.transaction("kv").objectStore("kv").get(key); r.onsuccess = () => res(r.result as T); r.onerror = () => res(undefined); });
  } catch { return undefined; }
}
async function idbPut(key: string, value: unknown) {
  try { const db = await idb(); await new Promise((res) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(value, key); t.oncomplete = t.onerror = () => res(null); }); } catch { /* приватный режим */ }
}
/** Кэш другого сотрудника на этом устройстве удаляется — его цены этому пользователю не нужны */
async function idbCleanup(keep: string) {
  try {
    const db = await idb();
    const t = db.transaction("kv", "readwrite");
    const r = t.objectStore("kv").getAllKeys();
    r.onsuccess = () => { for (const k of r.result) if (k !== keep) t.objectStore("kv").delete(k); };
  } catch { /* нет IndexedDB */ }
}
const key = () => `index:v1:u${userId}`;

/* ───── синхронизация ───── */
async function sync(force = false) {
  if (syncing) return syncing;
  if (!force && Date.now() - lastSync < 1500) return;
  syncing = (async () => {
    try {
      const qs = st && !force ? `?since=${st.now}&perm=${st.permKey}` : "";
      const r = await fetch(`/api/index${qs}`, { credentials: "same-origin", cache: "no-store" });
      if (r.status === 401) { st = null; await idbPut(key(), null); failed = true; status(); return; }
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as IndexPayload;
      online = true; failed = false;
      merge(d);
      rebuild();
      await idbPut(key(), st);
    } catch {
      online = false;
      status();
    } finally {
      lastSync = Date.now();
      syncing = null;
    }
  })();
  return syncing;
}

function merge(d: IndexPayload) {
  const base: State = !st || d.full
    ? { v: 1, userId, now: d.now, permKey: d.permKey, canProducts: d.canProducts, canCreateProduct: d.canCreateProduct, canCounterparties: d.canCounterparties,
        priceTypes: d.priceTypes, folders: d.folders, users: d.users, synonyms: d.synonyms, products: [], cps: [], pStats: d.pStats, cStats: d.cStats }
    : { ...st, now: d.now, priceTypes: d.priceTypes, folders: d.folders, users: d.users, synonyms: d.synonyms, pStats: d.pStats, cStats: d.cStats, canCreateProduct: d.canCreateProduct };
  if (d.full) { base.products = d.products.rows; base.cps = d.cps.rows; st = base; return; }
  const pm = new Map(base.products.map((p) => [p.id, p]));
  for (const id of d.products.deleted) pm.delete(id);
  for (const p of d.products.rows) pm.set(p.id, p);
  const cm = new Map(base.cps.map((c) => [c.id, c]));
  for (const id of d.cps.deleted) cm.delete(id);
  for (const c of d.cps.rows) cm.set(c.id, c);
  base.products = [...pm.values()];
  base.cps = [...cm.values()];
  st = base;
}

/* ───── поиск ───── */
const productHit = (id: number, cpId?: number | null): ProductHit | null => {
  const p = P.get(id);
  if (!p) return null;
  const s = pStat.get(id);
  return { id, name: p.n, sku: p.sku, barcode: p.bc, unit: p.u, folder: p.f ? folderName.get(p.f) ?? null : null, folderId: p.f, photo: p.ph, prices: p.pr,
    stock: s?.[0] ?? 0, minStock: p.mn, pop: s?.[1] ?? 0, bought: cpId ? hist.get(cpId)?.get(id) ?? 0 : 0 };
};
const cpHit = (id: number): CpHit | null => {
  const c = C.get(id);
  if (!c) return null;
  const s = cStat.get(id);
  return { id, name: c.n, phone: c.ph, whatsapp: c.wa, kind: c.k, segment: c.seg, tags: c.tags, isService: c.svc, managerId: c.m, clientDebt: s?.[0] ?? 0, ourDebt: s?.[1] ?? 0, bin: c.bin };
};

function rank(kind: SearchKind, o: SearchOpts): RankCtx {
  if (kind === "products") return {
    pop: (id) => pStat.get(id)?.[1] ?? 0, inStock: (id) => (pStat.get(id)?.[0] ?? 0) > 0, hist: o.cpId ? hist.get(o.cpId) : undefined,
  };
  if (kind === "counterparties") {
    const k = o.cpKind;
    return {
      filter: k ? (id) => { const c = C.get(id); return !!c && (c.k === k || c.k === "both"); } : undefined,
      // служебные «Заявка» ниже обычных клиентов, должники и частые — выше
      pop: (id) => (C.get(id)?.svc ? 0 : 1 + Math.min(20, Math.abs(cStat.get(id)?.[0] ?? 0) / 1e6)),
    };
  }
  if (kind === "users") return { filter: o.salesOnly ? (id) => !!st?.users.find((u) => u.id === id)?.sales : undefined };
  return {};
}

function doSearch(kind: SearchKind, q: string, o: SearchOpts): SearchResult {
  const t0 = performance.now();
  const limit = o.limit ?? 60;
  const ix = kind === "products" ? pIdx : kind === "counterparties" ? cIdx : kind === "users" ? uIdx : fIdx;
  const r = rank(kind, o);
  const toItem = (id: number): SearchResult["items"][number] | null => {
    if (kind === "products") return productHit(id, o.cpId);
    if (kind === "counterparties") return cpHit(id);
    if (kind === "users") { const u = st?.users.find((x) => x.id === id); return u ? ({ id, name: u.name } as SimpleHit) : null; }
    const f = st?.folders.find((x) => x.id === id);
    return f ? ({ id, name: f.name, extra: f.parentId ? folderName.get(f.parentId) : null } as SimpleHit) : null;
  };
  let items: SearchResult["items"] = [];
  let total = 0;
  if (q.trim()) {
    const res = ix.search(q, limit, r);
    total = res.total;
    for (const h of res.hits) { const it = toItem(h.id); if (it) items.push(it); }
  } else {
    // пустое поле: недавние → что брал клиент → популярное
    const seen = new Set<number>();
    const push = (id: number, group: "recent" | "client" | "popular") => {
      if (seen.has(id) || items.length >= Math.min(limit, 24) || !ix.has(id) || (r.filter && !r.filter(id))) return;
      const it = toItem(id);
      if (it) { seen.add(id); items.push({ ...it, group }); }
    };
    for (const id of o.recent ?? []) push(id, "recent");
    if (kind === "products" && o.cpId) for (const [id] of [...(hist.get(o.cpId) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])) push(id, "client");
    for (const h of ix.top(30, r)) push(h.id, "popular");
    total = items.length;
  }
  return { items, total, ms: performance.now() - t0 };
}

/** Разбор строк списка (текст/голос) тем же индексом */
function doMatch(lines: { name: string }[], o: SearchOpts): MatchResult[] {
  const r = rank("products", o);
  return lines.map((l) => {
    const res = pIdx.search(l.name, 6, r).hits;
    const candidates = res.map((h) => ({ ...productHit(h.id, o.cpId)!, score: Math.min(100, Math.round(h.match)) })).filter((c) => c.id);
    if (!candidates.length) return { status: "not_found", candidates };
    const [a, b] = res;
    const clear = a.match >= 80 && (!b || a.match - b.match >= 6 || a.score - b.score >= 12);
    return { status: clear ? "matched" : "ambiguous", candidates };
  });
}

/** Замер в самом воркере: синтетический каталог из n товаров */
function bench(n: number) {
  const words = ["Кабель", "Провод", "Автомат", "Розетка", "Выключатель", "Перфоратор", "Дрель", "Болгарка", "Шуруповёрт", "Коробка", "Гофра", "Лампа", "Удлинитель", "Щит", "Клемма"];
  const brands = ["ВВГнг", "ПВС", "ABB", "Makita", "Bosch", "Legrand", "IEK", "Schneider", "Норд", "Атлас", "Вектор"];
  const docs: IndexDoc[] = Array.from({ length: n }, (_, i) => ({ id: i + 1, fields: [
    { text: `${words[i % words.length]} ${brands[(i * 7) % brands.length]} ${1 + (i % 5)}х${[1.5, 2.5, 4, 6, 10][i % 5]} модель ${i}`, w: 1 }, { text: `SKU-${i}`, w: 0.92 },
  ] }));
  const t0 = performance.now();
  const ix = new SearchIndex(docs);
  const buildMs = performance.now() - t0;
  const qs = ["к", "ка", "каб", "кабе", "кабел", "кабель", "кабель в", "кабель вв", "кабель ввг 3х2", "rf,tkm", "кбл", "перфаратор", "makita", "3х2,5", "sku-12", "щ", "щи", "щит"];
  const t: number[] = [];
  for (let k = 0; k < 5; k++) for (const q of qs) { const s = performance.now(); ix.search(q, 60, { pop: (id) => id % 13, inStock: (id) => id % 3 > 0 }); t.push(performance.now() - s); }
  t.sort((a, b) => a - b);
  return { n, buildMs, p50: t[Math.floor(t.length / 2)], p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1] };
}

async function loadHistory(cpId: number) {
  if (hist.has(cpId)) return;
  hist.set(cpId, new Map());
  try {
    const r = await fetch(`/api/index/history?cp=${cpId}`, { credentials: "same-origin" });
    if (r.ok) hist.set(cpId, new Map((await r.json()) as [number, number][]));
  } catch { /* офлайн — без истории */ }
}

ctx.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case "init": {
      if (userId === m.userId && st) { status(); return; }
      userId = m.userId;
      status();
      void idbCleanup(key());
      const cached = await idbGet<State>(key());
      if (cached && cached.v === 1 && cached.userId === userId) { st = cached; rebuild(); }
      // есть кэш — сразу ищем по нему, а с сервера берём только изменения; нет — полная загрузка
      void sync(!cached);
      return;
    }
    case "sync": void sync(m.force); return;
    case "history": void loadHistory(m.cpId); return;
    case "search": post({ type: "result", id: m.id, result: doSearch(m.kind, m.q, m.opts) }); return;
    case "match": post({ type: "match", id: m.id, result: doMatch(m.lines, m.opts) }); return;
    case "bench": post({ type: "bench", id: m.id, result: bench(m.n) }); return;
    case "clear": st = null; P.clear(); C.clear(); hist.clear(); try { indexedDB.deleteDatabase(DB_NAME); } catch { /* */ } status(); return;
  }
};
