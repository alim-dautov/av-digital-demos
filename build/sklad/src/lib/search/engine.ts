/**
 * Собственный поисковый индекс для мгновенного поиска по 1–10 тыс. записей.
 *
 * Почему не MiniSearch/FlexSearch: нужны раскладка, транслит, казахские буквы, «соседние клавиши»,
 * размеры «3х2,5», телефоны и своё ранжирование (продажи, остаток, история клиента). В готовых движках
 * это всё равно пришлось бы делать снаружи, а сам словарь на 5 000 товаров — это ~10 тыс. слов,
 * полный проход по нему занимает доли миллисекунды. Своя реализация — ~300 строк без зависимостей.
 *
 * Структура: словарь уникальных «скелетов» слов (отсортирован для бинарного поиска по префиксу),
 * у каждого слова — список документов с весом поля (название важнее папки и меток).
 */
import { editLe1, adjacentKeys, fold, initialSubseq, prefixLe1, queryVariants, skel } from "./text";

export type Field = { text: string | null | undefined; w: number; phone?: boolean; code?: boolean };
export type IndexDoc = { id: number; fields: Field[] };

type Entry = { s: string; f: string; docs: number[]; ws: number[]; digits: boolean };

export type Hit = { id: number; score: number; match: number };
export type RankCtx = {
  /** продажи за период — выше чаще продаваемые */
  pop?: (id: number) => number;
  /** есть на складе */
  inStock?: (id: number) => boolean;
  /** сколько раз брал выбранный клиент */
  hist?: Map<number, number>;
  /** только такие документы (например, только поставщики) */
  filter?: (id: number) => boolean;
};

const SCORE = { exact: 100, prefix: 82, synonym: 74, phone: 80, substr: 46, typo: 36, adj: 33, abbr: 44, subseq: 27 };

export class SearchIndex {
  private ids: number[] = [];
  private pos = new Map<number, number>();
  private vocab: Entry[] = [];
  private sorted: string[] = [];
  private bySkel = new Map<string, Entry>();
  private syn: string[][] = [];

  constructor(docs: IndexDoc[] = [], synonyms: string[][] = []) {
    this.setSynonyms(synonyms);
    this.build(docs);
  }

  get size() { return this.ids.length; }

  setSynonyms(groups: string[][]) {
    this.syn = groups.map((g) => g.map((t) => fold(t).split(" ").map(skel).join(" ")).filter(Boolean)).filter((g) => g.length > 1);
  }

  build(docs: IndexDoc[]) {
    this.ids = docs.map((d) => d.id);
    this.pos = new Map(this.ids.map((id, i) => [id, i]));
    this.bySkel = new Map();
    docs.forEach((d, di) => {
      const seen = new Map<string, number>();
      for (const fl of d.fields) {
        if (!fl.text) continue;
        const words = fl.phone ? [fl.text.replace(/\D/g, "")] : fold(fl.text).split(" ");
        words.forEach((w, wi) => {
          if (!w) return;
          const wt = fl.w * (wi === 0 ? 1 : 0.97);
          this.addWord(w, wt, di, seen);
          // «ввгнг3x2.5» → «ввгнг», «3x2.5», «3», «2.5»
          const segs = fl.phone ? [] : w.match(/[\p{L}]+|\d+(?:\.\d+)?/gu) ?? [];
          if (segs.length > 1) for (const sg of segs) this.addWord(sg, wt * 0.85, di, seen);
          if (fl.phone && w.length >= 10) this.addWord(w.slice(-10), wt, di, seen); // без кода страны
        });
      }
    });
    this.vocab = [...this.bySkel.values()];
    this.sorted = this.vocab.map((e) => e.s).sort();
    const order = new Map(this.sorted.map((s, i) => [s, i]));
    this.vocab.sort((a, b) => order.get(a.s)! - order.get(b.s)!);
  }

  private addWord(w: string, wt: number, di: number, seen: Map<string, number>) {
    const s = skel(w);
    if (!s) return;
    const key = `${s}`;
    const prev = seen.get(key);
    let e = this.bySkel.get(s);
    if (!e) { e = { s, f: w, docs: [], ws: [], digits: /^\d+$/.test(s) }; this.bySkel.set(s, e); }
    if (prev === undefined) { seen.set(key, e.docs.length); e.docs.push(di); e.ws.push(wt); }
    else if (e.docs[prev] === di && e.ws[prev] < wt) e.ws[prev] = wt;
  }

  /** Индексы слов словаря, начинающихся с prefix (бинарный поиск по отсортированному словарю) */
  private prefixRange(prefix: string): [number, number] {
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.sorted[m] < prefix) lo = m + 1; else hi = m; }
    let end = lo;
    while (end < this.sorted.length && this.sorted[end].startsWith(prefix)) end++;
    return [lo, end];
  }

  /** Оценка одного слова запроса для всех документов: лучшая по словам документа */
  private scoreWord(word: string, out: Float32Array) {
    const s = skel(word);
    if (!s) return;
    const put = (e: Entry, sc: number) => {
      for (let k = 0; k < e.docs.length; k++) {
        const v = sc * e.ws[k];
        if (v > out[e.docs[k]]) out[e.docs[k]] = v;
      }
    };
    const matched = new Set<Entry>();
    const [a, b] = this.prefixRange(s);
    for (let i = a; i < b; i++) {
      const e = this.vocab[i];
      matched.add(e);
      put(e, e.s === s ? SCORE.exact : SCORE.prefix);
    }
    // синонимы: «перф» ↔ «перфоратор», «ушм» ↔ «болгарка»
    if (s.length >= 3) {
      for (const g of this.syn) {
        if (!g.some((t) => t.startsWith(s) || s.startsWith(t))) continue;
        for (const t of g) {
          const [c, d] = this.prefixRange(t.split(" ")[0]);
          for (let i = c; i < d; i++) if (!matched.has(this.vocab[i])) { matched.add(this.vocab[i]); put(this.vocab[i], SCORE.synonym); }
        }
      }
    }
    const digits = /^\d+$/.test(s);
    const len = s.length;
    const f0 = word[0];
    for (const e of this.vocab) {
      if (matched.has(e)) continue;
      if (len >= 2 && e.s.includes(s)) { put(e, digits && e.digits ? SCORE.phone : SCORE.substr); continue; }
      if (digits) continue;
      // опечатка: одна правка для слов от 4 букв
      if (len >= 4 && e.s.length >= len - 1 && (e.s[0] === s[0] || e.s[1] === s[0]) && prefixLe1(s, e.s)) { put(e, SCORE.typo); continue; }
      // короткое слово: соседняя клавиша («вво» → «ввг»)
      if (word.length === 3 && e.f.length >= 3 && e.f[0] === f0 && adjacentTypo(word, e.f)) { put(e, SCORE.adj); continue; }
      // сокращение: «кб» → «кабель»
      // согласные подряд с начала слова («кб» → к-б-л «кабель») — выше, чем «кб» в «карболитовый»
      if (len >= 2 && len <= 4 && initialSubseq(s, e.s)) put(e, e.s.replace(/[aeiouy]/g, "").startsWith(s) ? SCORE.abbr : SCORE.subseq);
    }
  }

  search(q: string, limit = 60, ctx: RankCtx = {}): { hits: Hit[]; total: number } {
    const n = this.ids.length;
    if (!n) return { hits: [], total: 0 };
    const best = new Float32Array(n);
    const bestMatch = new Float32Array(n);
    for (const v of queryVariants(q).slice(0, 3)) {
      const words = v.words.slice(0, 8);
      const per = words.map((w) => { const a = new Float32Array(n); this.scoreWord(w, a); return a; });
      for (let d = 0; d < n; d++) {
        let sum = 0, hit = 0;
        for (const a of per) { if (a[d] > 0) { sum += a[d]; hit++; } }
        if (!hit) continue;
        // все слова должны найтись; если не нашлось одно из 3+ слов — оставляем, но ниже
        const need = words.length;
        if (hit < need && !(need >= 3 && hit === need - 1)) continue;
        const m = (sum / need) * v.penalty * (hit < need ? 0.6 : 1);
        if (m > bestMatch[d]) bestMatch[d] = m;
      }
    }
    for (let d = 0; d < n; d++) {
      const m = bestMatch[d];
      if (!m) continue;
      const id = this.ids[d];
      if (ctx.filter && !ctx.filter(id)) { bestMatch[d] = 0; continue; }
      best[d] = m + boosts(id, ctx);
    }
    const hits: Hit[] = [];
    for (let d = 0; d < n; d++) if (best[d] > 0) hits.push({ id: this.ids[d], score: best[d], match: bestMatch[d] });
    hits.sort((x, y) => y.score - x.score || x.id - y.id);
    return { hits: hits.slice(0, limit), total: hits.length };
  }

  /** Без запроса: история клиента и популярное */
  top(limit = 20, ctx: RankCtx = {}) {
    const hits: Hit[] = [];
    for (const id of this.ids) {
      if (ctx.filter && !ctx.filter(id)) continue;
      const b = boosts(id, ctx);
      if (b > 0) hits.push({ id, score: b, match: 0 });
    }
    hits.sort((x, y) => y.score - x.score || x.id - y.id);
    return hits.slice(0, limit);
  }

  has(id: number) { return this.pos.has(id); }
}

/** Порядок внутри одинаково совпавших: история клиента → продажи → наличие */
function boosts(id: number, ctx: RankCtx) {
  let b = 0;
  const h = ctx.hist?.get(id);
  if (h) b += 12 + Math.min(8, Math.log2(1 + h) * 3);
  const p = ctx.pop?.(id) ?? 0;
  if (p > 0) b += Math.min(10, Math.log2(1 + p) * 2);
  if (ctx.inStock?.(id)) b += 4;
  return b;
}

/** Ровно одна буква отличается и это соседняя клавиша (для слов из 3 букв) */
function adjacentTypo(word: string, target: string) {
  const t = target.slice(0, 3);
  let diff = -1;
  for (let i = 0; i < 3; i++) if (word[i] !== t[i]) { if (diff >= 0) return false; diff = i; }
  return diff > 0 && adjacentKeys(word[diff], t[diff]);
}

export { editLe1 };
