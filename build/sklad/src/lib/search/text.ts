/**
 * Нормализация текста для мгновенного поиска (без зависимостей: работает в Web Worker, на сервере и в тестах).
 *
 * fold()   — регистр, ё/е, «3х2,5» → «3x2.5», дефисы и знаки → пробел.
 * skel()   — «скелет» слова латиницей: кириллица, казахские буквы и латиница сводятся к одному виду,
 *            поэтому «макита» = «makita», «ввг» = «vvg», а мелкие различия (и/й/ы, е/э) не мешают.
 * layout() — набор не в той раскладке: «rf,tkm» → «кабель», «ьфлшеф» → «makita».
 */

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`";
const RU = "йцукенгшщзхъфывапролджэячсмитьбю.ё";
const EN_RU = new Map<string, string>();
const RU_EN = new Map<string, string>();
for (let i = 0; i < EN.length; i++) { EN_RU.set(EN[i], RU[i]); RU_EN.set(RU[i], EN[i]); }
// символы с Shift в английской раскладке
for (const [a, b] of [["{", "х"], ["}", "ъ"], [":", "ж"], ['"', "э"], ["<", "б"], [">", "ю"], ["~", "ё"]] as const) EN_RU.set(a, b);

const hasDigit = /\d/;

/** Английская раскладка → русская. Слова с цифрами (размеры «3x2.5», артикулы) не трогаем. */
export function enToRu(s: string) {
  return s.split(/(\s+)/).map((w) => (hasDigit.test(w) || !/[a-z[\];',.`{}:"<>~]/i.test(w) ? w : [...w.toLowerCase()].map((c) => EN_RU.get(c) ?? c).join(""))).join("");
}
/** Русская раскладка → английская (латинские марки, набранные в русской раскладке) */
export function ruToEn(s: string) {
  return s.split(/(\s+)/).map((w) => (hasDigit.test(w) || !/[а-яё]/i.test(w) ? w : [...w.toLowerCase()].map((c) => RU_EN.get(c) ?? c).join(""))).join("");
}

/** Регистр, ё, размеры, знаки препинания. Сохраняет «.» и «x» внутри чисел. */
export function fold(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(\d)\s*[,.]\s*(\d)/g, "$1.$2")
    .replace(/(\d)\s*[xх×*/]\s*(?=\d)/g, "$1x")
    .replace(/(\d)\s*[xх×*/]\s*(?=\d)/g, "$1x") // повтор для «3х2х1,5»; «3/2,5» и «4*1.5» — то же, что «3х2,5»
    .replace(/[^\p{L}\p{N}.\s]/gu, " ")
    .replace(/(^|[^\d])\.|\.(?!\d)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  // казахские буквы
  ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** Латинский «скелет» одного слова (слово уже прошло fold) */
export function skel(word: string) {
  if (/^[\d.x]+$/.test(word)) return word; // числа и размеры как есть
  let out = "";
  for (const ch of word) out += CYR[ch] ?? ch;
  return out
    .replace(/ph/g, "f").replace(/w/g, "v").replace(/q/g, "k").replace(/c/g, "k")
    .replace(/([a-z])x(?=[a-z])/g, "$1ks").replace(/y/g, "i");
}


/** Соседние клавиши (ЙЦУКЕН и QWERTY) — для опечаток в коротких словах */
const ROWS_RU = ["йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"];
const ROWS_EN = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ADJ = new Map<string, Set<string>>();
for (const rows of [ROWS_RU, ROWS_EN]) {
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const set = ADJ.get(ch) ?? new Set<string>();
      for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, -1]]) {
        const n = rows[r + dr]?.[c + dc];
        if (n) set.add(n);
      }
      ADJ.set(ch, set);
    });
  });
}
export const adjacentKeys = (a: string, b: string) => ADJ.get(a)?.has(b) ?? false;

/** Не более одной правки (замена, вставка, удаление, перестановка соседних) между a и b */
export function editLe1(a: string, b: string) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Начало b совпадает с a с точностью до одной правки */
export function prefixLe1(a: string, b: string) {
  const la = a.length;
  for (let L = la - 1; L <= la + 1; L++) if (L > 0 && L <= b.length && editLe1(a, b.slice(0, L))) return true;
  return false;
}

/** «кб» → «кабель»: первая буква совпадает, остальные идут по порядку */
export function initialSubseq(a: string, b: string) {
  if (a.length < 2 || a[0] !== b[0] || b.length > a.length * 5 + 4) return false;
  let j = 1;
  for (let i = 1; i < a.length; i++) {
    j = b.indexOf(a[i], j);
    if (j < 0) return false;
    j++;
  }
  return true;
}

/** Цифры телефона: +7 (701) 123-45-67 и 8 701 … → 77011234567 */
export function phoneDigits(s: string | null | undefined) {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") return "7" + d.slice(1);
  if (d.length === 10) return "7" + d;
  return d;
}

/** Варианты запроса: как набран, в другой раскладке (каждый — свой полный набор слов) */
export function queryVariants(q: string): { words: string[]; penalty: number }[] {
  const out: { words: string[]; penalty: number }[] = [];
  const seen = new Set<string>();
  const add = (s: string, penalty: number) => {
    const words = fold(s).split(" ").filter(Boolean);
    const key = words.join(" ");
    if (!words.length || seen.has(key)) return;
    seen.add(key);
    out.push({ words, penalty });
  };
  add(q, 1);
  // вариант раскладки не должен терять буквы: «кб» → «r,» → «r» дал бы ложные совпадения
  const letters = (q.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const layout = (v: string) => { if (fold(v).replace(/[\s.]/g, "").length >= letters) add(v, 0.96); };
  if (/[a-z[\];',.`]/i.test(q)) layout(enToRu(q));
  if (/[а-яё]/i.test(q)) layout(ruToEn(q));
  return out;
}

export type Segment = { t: string; hit: boolean };

/** Подсветка: в каждом слове названия выделяем часть, совпавшую с одним из слов запроса */
export function highlight(text: string, q: string): Segment[] {
  const qs = queryVariants(q).flatMap((v) => v.words.map(skel)).filter(Boolean);
  if (!qs.length) return [{ t: text, hit: false }];
  const out: Segment[] = [];
  const re = /[\p{L}\p{N}]+(?:[.,xх×][\p{N}]+)*/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const word = m[0];
    const start = m.index ?? 0;
    if (start > last) out.push({ t: text.slice(last, start), hit: false });
    const range = matchRange(word, qs);
    if (range) {
      if (range[0] > 0) out.push({ t: word.slice(0, range[0]), hit: false });
      out.push({ t: word.slice(range[0], range[1]), hit: true });
      if (range[1] < word.length) out.push({ t: word.slice(range[1]), hit: false });
    } else out.push({ t: word, hit: false });
    last = start + word.length;
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false });
  return out;
}

function matchRange(word: string, qs: string[]): [number, number] | null {
  const f = fold(word).replace(/ /g, "");
  const parts = [...f].length === word.length ? [...f].map((ch) => (/[\d.x]/.test(ch) ? ch : skel(ch))) : null;
  const ws = skel(f);
  let best: [number, number] | null = null;
  for (const qq of qs) {
    const at = ws.indexOf(qq);
    if (at < 0) {
      // опечатка/раскладка: подсвечиваем начало слова той же длины
      if (qq.length >= 3 && prefixLe1(qq, ws)) best ??= [0, Math.min(word.length, qq.length)];
      continue;
    }
    if (!parts) { best = [0, Math.min(word.length, qq.length)]; continue; }
    // переводим позицию в скелете обратно в символы слова
    let pos = 0, from = -1, to = word.length;
    for (let i = 0; i < parts.length; i++) {
      if (from < 0 && pos + parts[i].length > at) from = i;
      pos += parts[i].length;
      if (from >= 0 && pos >= at + qq.length) { to = i + 1; break; }
    }
    if (from >= 0 && (!best || to - from > best[1] - best[0])) best = [from, to];
  }
  return best;
}
