/**
 * Разбор списка позиций из текста/голоса и нечёткое сопоставление с каталогом.
 * Чистые функции — используются в заявках, приёмках (ручной разбор) и ассистенте.
 */
import { norm } from "@/lib/format";

export type ParsedLine = { raw: string; name: string; qty: number; unit: string | null; price: number | null };

const UNIT_RE = "(шт|штук[аи]?|м|метр(?:ов|а)?|мп|бух(?:т[аы])?|уп(?:ак(?:овк[аи])?)?|кг|пач(?:к[аи])?|рул(?:он(?:ов|а)?)?|компл(?:ект(?:ов|а)?)?|пар[аы]?|кор(?:обк[аи])?)";
const NUM = "(\\d+(?:[.,]\\d+)?)";
const WORD_NUM: Record<string, number> = {
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, сто: 100, двести: 200, триста: 300, пятьсот: 500,
};

const toNum = (s: string) => Number(s.replace(",", "."));

export function normalizeUnit(u: string | null): string | null {
  if (!u) return null;
  const s = u.toLowerCase();
  if (s.startsWith("шт")) return "шт";
  if (s === "м" || s === "мп" || s.startsWith("метр")) return "м";
  if (s.startsWith("бух")) return "бухта";
  if (s.startsWith("уп")) return "уп";
  if (s.startsWith("пач")) return "пачка";
  if (s.startsWith("рул")) return "рулон";
  if (s.startsWith("компл")) return "компл";
  if (s.startsWith("кор")) return "коробка";
  return s;
}

export function parseLine(rawLine: string): ParsedLine | null {
  let s = rawLine.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(\d{1,3}[.)]\s+|[-•*–—]\s*)/, "").trim();
  if (!s || s.length < 2) return null;
  // словесные числа (голос): «кабель ввг двадцать метров»
  s = s.replace(/(^|\s)(один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|двадцать|тридцать|сорок|пятьдесят|сто|двести|триста|пятьсот)(?=\s|$)/gi, (_, sp, w) => `${sp}${WORD_NUM[w.toLowerCase()]}`);

  let qty = 1, unit: string | null = null, price: number | null = null, name = s;

  // цена в конце: «... 10 шт по 450» / «... 10шт 450тг»
  const priceRe = new RegExp(`\\s(?:по|@)\\s*${NUM}\\s*(?:тг|₸|тенге)?\\.?$|\\s${NUM}\\s*(?:тг|₸|тенге)\\.?$`, "i");
  const pm = priceRe.exec(name);
  if (pm) { price = toNum(pm[1] ?? pm[2]); name = name.slice(0, pm.index).trim(); }
  else {
    // «... 40 шт 900» — голое число после количества с единицей = цена
    const tail = new RegExp(`\\s${NUM}$`).exec(name);
    const rest = tail ? name.slice(0, tail.index) : "";
    const qm = tail ? new RegExp(`\\s${NUM}\\s*${UNIT_RE}\\.?$`, "i").exec(rest) : null;
    if (tail && qm && qm[2]) { price = toNum(tail[1]); name = rest.trim(); }
  }

  const endRe = new RegExp(`(\\s*[-–—:=]\\s*|\\s+[x×*]\\s*|\\s+)${NUM}\\s*${UNIT_RE}?\\.?$`, "i");
  const startRe = new RegExp(`^${NUM}\\s*${UNIT_RE}?\\.?\\s+(?:[x×*]\\s*)?(.+)$`, "i");
  const em = endRe.exec(name);
  const before = em ? name.slice(0, em.index) : "";
  // явный разделитель («- 100», « x 5») — точно количество; иначе не путаем с размерностью вида 3х2,5
  const explicitSep = !!em && em[1].trim().length > 0;
  if (em && before.trim().length > 0 && (explicitSep || !!em[3] || !/[\dxх×]$/i.test(before.trim()))) {
    qty = toNum(em[2]); unit = normalizeUnit(em[3] ?? null); name = before.trim();
  } else {
    const sm = startRe.exec(name);
    if (sm && !/^[xх×]/i.test(sm[3]) && !/^[aа]\b/i.test(sm[3])) { qty = toNum(sm[1]); unit = normalizeUnit(sm[2] ?? null); name = sm[3].trim(); }
  }
  name = name.replace(/[-–—:,;]+$/, "").trim();
  if (!name) return null;
  if (!(qty > 0)) qty = 1;
  return { raw: rawLine.trim(), name, qty, unit, price };
}

export function parseList(text: string): ParsedLine[] {
  return text.split(/\r?\n|;/).map(parseLine).filter((x): x is ParsedLine => !!x);
}

/** Нормализация для сопоставления: 3х2,5 → 3x2.5, ё→е */
export function matchKey(s: string) {
  return norm(s)
    .replace(/(\d)\s*[xх×*]\s*(\d)/g, "$1x$2")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string) {
  const t = new Set<string>();
  const x = `  ${s} `;
  for (let i = 0; i < x.length - 2; i++) t.add(x.slice(i, i + 3));
  return t;
}
function trigramSim(a: string, b: string) {
  const A = trigrams(a), B = trigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

export function scoreMatch(query: string, candidate: string) {
  const qk = matchKey(query), ck = matchKey(candidate);
  if (!qk) return 0;
  if (qk === ck) return 1;
  const qt = qk.split(" "), ct = ck.split(" ");
  let hit = 0;
  for (const t of qt) {
    if (ct.some((c) => c === t)) hit += 1;
    else if (t.length >= 3 && ct.some((c) => c.startsWith(t) || t.startsWith(c) && c.length >= 3)) hit += 0.8;
    else if (/\d/.test(t)) hit -= 0.5; // несовпадающее сечение/размер — сильный штраф
  }
  const tokenScore = Math.max(0, hit / qt.length);
  return 0.7 * tokenScore + 0.3 * trigramSim(qk, ck);
}

export type MatchResult<T> = { status: "matched" | "ambiguous" | "not_found"; best: (T & { score: number }) | null; candidates: (T & { score: number })[] };

export function matchProduct<T extends { name: string; sku?: string | null }>(query: string, catalog: T[], limit = 5): MatchResult<T> {
  const qk = matchKey(query);
  const exactSku = catalog.find((c) => c.sku && matchKey(c.sku) === qk);
  if (exactSku) return { status: "matched", best: { ...exactSku, score: 1 }, candidates: [{ ...exactSku, score: 1 }] };
  const scored = catalog.map((c) => ({ ...c, score: scoreMatch(query, `${c.name} ${c.sku ?? ""}`) }))
    .filter((c) => c.score > 0.25).sort((a, b) => b.score - a.score).slice(0, limit);
  const best = scored[0] ?? null;
  if (!best) return { status: "not_found", best: null, candidates: [] };
  const second = scored[1]?.score ?? 0;
  const gap = best.score - second;
  const status = (best.score >= 0.72 && gap >= 0.08) || (best.score >= 0.6 && gap >= 0.25) ? "matched" : best.score >= 0.4 ? "ambiguous" : "not_found";
  return { status, best: status === "not_found" ? null : best, candidates: scored };
}
