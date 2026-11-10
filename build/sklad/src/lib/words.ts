/** Сумма прописью: 123456,78 ₸ → «Сто двадцать три тысячи четыреста пятьдесят шесть тенге 78 тиын» */
const ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
const SCALES: [string, string, string, boolean][] = [
  ["", "", "", false],
  ["тысяча", "тысячи", "тысяч", true],
  ["миллион", "миллиона", "миллионов", false],
  ["миллиард", "миллиарда", "миллиардов", false],
];

function plural(n: number, f: [string, string, string]) {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 19) return f[2];
  if (b === 1) return f[0];
  if (b >= 2 && b <= 4) return f[1];
  return f[2];
}

function triple(n: number, fem: boolean) {
  const w: string[] = [HUNDREDS[Math.floor(n / 100)]];
  const t = n % 100;
  if (t >= 10 && t < 20) w.push(TEENS[t - 10]);
  else { w.push(TENS[Math.floor(t / 10)]); w.push((fem ? ONES_F : ONES)[t % 10]); }
  return w.filter(Boolean).join(" ");
}

export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "ноль";
  const parts: string[] = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const t = n % 1000;
    if (!t) continue;
    const [one, few, many, fem] = SCALES[i];
    parts.unshift([triple(t, fem), i ? plural(t, [one, few, many]) : ""].filter(Boolean).join(" "));
  }
  return parts.join(" ");
}

export function moneyInWords(tiyn: number) {
  const t = Math.round(Math.abs(tiyn));
  const w = numberToWords(Math.floor(t / 100));
  return `${w[0].toUpperCase()}${w.slice(1)} тенге ${String(t % 100).padStart(2, "0")} тиын`;
}
