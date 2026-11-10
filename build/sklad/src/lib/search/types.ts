/** Общие типы мгновенного поиска (страница ↔ Web Worker) */
export type SearchKind = "products" | "counterparties" | "users" | "folders";

export type ProductHit = {
  id: number; name: string; sku: string | null; barcode: string | null; unit: string; folder: string | null; folderId: number | null;
  photo: number | null; prices: Record<string, number>; stock: number; minStock: number; pop: number; bought: number;
};
export type CpHit = {
  id: number; name: string; phone: string | null; whatsapp: string | null; kind: string; segment: string; tags: string[];
  isService: boolean; managerId: number | null; clientDebt: number; ourDebt: number; bin: string | null;
};
export type SimpleHit = { id: number; name: string; extra?: string | null };

export type HitOf<K extends SearchKind> = K extends "products" ? ProductHit : K extends "counterparties" ? CpHit : SimpleHit;

export type SearchOpts = {
  limit?: number;
  /** клиент заявки — его прошлые позиции выше */
  cpId?: number | null;
  /** контрагенты: только клиенты / только поставщики */
  cpKind?: "client" | "supplier";
  /** для пустого запроса: недавно выбранные id */
  recent?: number[];
  /** пользователи: только менеджеры по продажам */
  salesOnly?: boolean;
};

export type SearchResult<K extends SearchKind = SearchKind> = {
  items: (HitOf<K> & { group?: "recent" | "client" | "popular" })[];
  total: number;
  ms: number;
};

export type MatchLine = { name: string };
export type MatchResult = { status: "matched" | "ambiguous" | "not_found"; candidates: (ProductHit & { score: number })[] };

export type SearchStatus = {
  state: "idle" | "loading" | "ready" | "offline" | "error";
  products: number; counterparties: number; syncedAt: number | null;
  canCreateProduct: boolean;
  priceTypes: { id: number; name: string; isPurchase: boolean }[];
};

export type ToWorker =
  | { type: "init"; userId: number }
  | { type: "sync"; force?: boolean }
  | { type: "history"; cpId: number }
  | { type: "search"; id: number; kind: SearchKind; q: string; opts: SearchOpts }
  | { type: "match"; id: number; lines: MatchLine[]; opts: SearchOpts }
  | { type: "bench"; id: number; n: number }
  | { type: "clear" };

export type FromWorker =
  | { type: "status"; status: SearchStatus }
  | { type: "result"; id: number; result: SearchResult }
  | { type: "match"; id: number; result: MatchResult[] }
  | { type: "bench"; id: number; result: { n: number; buildMs: number; p50: number; p95: number; max: number } };
