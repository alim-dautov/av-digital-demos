import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ReactNode } from "react";
import type { CompanySettings } from "@/modules/settings/store";

/**
 * Шрифт для PDF: Noto Sans (латиница + кириллица + казахские буквы ұ қ ә ғ ң + знак ₸).
 * Manrope этих глифов не содержит, поэтому в документах используется Noto Sans.
 */
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const LOGO = path.join(process.cwd(), "assets", "brand", "logo.png");
let logo: Buffer | null = null;
const logoSrc = () => ({ data: (logo ??= readFileSync(LOGO)), format: "png" as const });
let registered = false;
function fonts() {
  if (registered) return;
  Font.register({ family: "Noto", fonts: [{ src: path.join(FONT_DIR, "NotoSans-400.ttf") }, { src: path.join(FONT_DIR, "NotoSans-700.ttf"), fontWeight: 700 }] });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

export const C = { navy: "#0B2B54", yellow: "#FFB510", ink: "#0F1B2D", ink2: "#475569", ink3: "#64748B", line: "#E3E8EF", bg: "#F5F7FA", zebra: "#FAFBFD", danger: "#DC2626", success: "#16A34A", stamp: "#1F4FB5" };

/** Реквизиты для документов + картинки печати/подписи (если загружены) */
export type DocCompany = CompanySettings & { stampImg?: Buffer | null; signImg?: Buffer | null };

export const s = StyleSheet.create({
  page: { fontFamily: "Noto", fontSize: 9, color: C.ink, paddingTop: 22, paddingBottom: 46, paddingHorizontal: 32, lineHeight: 1.35 },
  topStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 5, flexDirection: "row" },
  brandBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, marginBottom: 14, borderBottomWidth: 1.2, borderColor: C.navy },
  logo: { height: 34, width: 124, objectFit: "contain" },
  brandSub: { fontSize: 6.5, color: C.ink3, marginTop: 3, letterSpacing: 0.8 },
  company: { fontSize: 7.5, color: C.ink2, textAlign: "right", lineHeight: 1.45 },
  companyName: { fontSize: 9, fontWeight: 700, color: C.navy, textAlign: "right" },
  h1: { fontSize: 16, fontWeight: 700, color: C.navy, lineHeight: 1.25, marginBottom: 2 },
  sub: { color: C.ink2, marginBottom: 10 },
  parties: { flexDirection: "row", gap: 10, marginBottom: 12 },
  party: { flex: 1, backgroundColor: C.bg, borderRadius: 4, padding: 8, borderLeftWidth: 2.5, borderColor: C.yellow },
  partyLabel: { fontSize: 6.5, color: C.ink3, letterSpacing: 0.8, marginBottom: 2 },
  partyName: { fontWeight: 700, fontSize: 9.5 },
  table: { borderWidth: 0.6, borderColor: C.line, borderRadius: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderColor: C.line },
  th: { backgroundColor: C.navy, fontWeight: 700, fontSize: 7.5, color: "#FFFFFF", borderColor: C.navy },
  td: { paddingVertical: 4.5, paddingHorizontal: 5 },
  right: { textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 250 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, paddingHorizontal: 8 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: C.navy, borderRadius: 4 },
  grandLabel: { color: "#FFFFFF", fontWeight: 700 },
  grandValue: { color: C.yellow, fontWeight: 700, fontSize: 13 },
  bold: { fontWeight: 700 },
  muted: { color: C.ink3 },
  box: { borderWidth: 0.6, borderColor: C.line, borderRadius: 4, padding: 8, marginBottom: 10 },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: C.ink3, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderColor: C.line, paddingTop: 5 },
  sign: { flexDirection: "row", gap: 30, marginTop: 30, paddingBottom: 40 },
  signCol: { flex: 1, position: "relative" },
  signLine: { borderBottomWidth: 0.6, borderColor: C.ink3, marginTop: 22, marginBottom: 2 },
});

export function Brand({ company }: { company: CompanySettings }) {
  return (
    <>
      <View style={s.topStripe} fixed><View style={{ flex: 3, backgroundColor: C.navy }} /><View style={{ flex: 1, backgroundColor: C.yellow }} /></View>
      <View style={s.brandBar}>
        <View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoSrc()} style={s.logo} />
          <Text style={s.brandSub}>ЭЛЕКТРОИНСТРУМЕНТ И КАБЕЛЬ</Text>
        </View>
        <View>
          <Text style={s.companyName}>{company.legalName || company.name}</Text>
          {company.bin ? <Text style={s.company}>БИН {company.bin}</Text> : null}
          <Text style={s.company}>{[company.address, company.phone].filter(Boolean).join(" · ")}</Text>
          {company.iban ? <Text style={s.company}>{company.bank} · ИИК {company.iban}{company.bik ? ` · БИК ${company.bik}` : ""}</Text> : null}
          {company.email || company.website ? <Text style={s.company}>{[company.email, company.website].filter(Boolean).join(" · ")}</Text> : null}
        </View>
      </View>
    </>
  );
}

/** Карточки сторон: «Поставщик» и «Покупатель» */
export function Parties({ items }: { items: { label: string; name: string; lines?: (string | null | undefined | false)[] }[] }) {
  return (
    <View style={s.parties}>
      {items.map((p) => (
        <View key={p.label} style={s.party}>
          <Text style={s.partyLabel}>{p.label.toUpperCase()}</Text>
          <Text style={s.partyName}>{p.name}</Text>
          {(p.lines ?? []).filter(Boolean).map((l, i) => <Text key={i} style={s.muted}>{l as string}</Text>)}
        </View>
      ))}
    </View>
  );
}

/** false — без нумерации страниц (запасной режим для очень длинных документов, см. renderPdf) */
const noPageNumbers = new AsyncLocalStorage<boolean>();

export function Footer({ left }: { left: string }) {
  const numbers = !noPageNumbers.getStore();
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      {numbers && <Text render={({ pageNumber, totalPages }) => `стр. ${pageNumber} из ${totalPages}`} />}
    </View>
  );
}

export type Col<R> = { title: string; width: number | string; right?: boolean; cell: (r: R, i: number) => string };

export function Table<R>({ cols, rows, foot }: { cols: Col<R>[]; rows: R[]; foot?: string[] }) {
  const w = (c: Col<R>) => (typeof c.width === "number" ? { width: c.width } : { flex: 1 });
  return (
    <View style={s.table}>
      <View style={[s.tr, s.th]} fixed>
        {cols.map((c, i) => <Text key={i} style={[s.td, w(c), c.right ? s.right : {}]}>{c.title}</Text>)}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={[s.tr, ri % 2 ? { backgroundColor: C.zebra } : {}, ri === rows.length - 1 && !foot ? { borderBottomWidth: 0 } : {}]} wrap={false}>
          {cols.map((c, i) => <Text key={i} style={[s.td, w(c), c.right ? s.right : {}]}>{c.cell(r, ri)}</Text>)}
        </View>
      ))}
      {foot && (
        <View style={[s.tr, { backgroundColor: C.bg, borderBottomWidth: 0 }]}>
          {cols.map((c, i) => <Text key={i} style={[s.td, w(c), c.right ? s.right : {}, s.bold]}>{foot[i] ?? ""}</Text>)}
        </View>
      )}
    </View>
  );
}

/** Итоги: последняя строка с флагом bold выводится плашкой «Итого» */
export function Totals({ rows }: { rows: [string, string, boolean?][] }) {
  const lastBold = rows.map((r) => !!r[2]).lastIndexOf(true);
  return (
    <View style={s.totals} wrap={false}>
      {rows.map(([k, v, b], i) => i === lastBold
        ? <View key={i} style={s.grand}><Text style={s.grandLabel}>{k}</Text><Text style={s.grandValue}>{v}</Text></View>
        : <View key={i} style={s.totalRow}><Text style={b ? s.bold : s.muted}>{k}</Text><Text style={b ? s.bold : {}}>{v}</Text></View>)}
    </View>
  );
}

/**
 * Круглая печать, нарисованная векторно из реквизитов: буквы по кругу шрифтом документа,
 * поэтому кириллица и казахские буквы печатаются одинаково на любом сервере.
 */
export function Stamp({ company, size = 104 }: { company: CompanySettings; size?: number }) {
  const ring = `${company.legalName || company.name}${company.bin ? ` · БИН ${company.bin}` : ""} · ${company.address || "Казахстан"} · `;
  const r = size / 2 - 10; // радиус середины строки букв
  // короткие реквизиты повторяем по кругу, чтобы кольцо было заполнено плотно, как у настоящей печати
  const fits = (n: number) => (2 * Math.PI * r) / (n * 0.62) >= 4.6;
  let chars = [...ring];
  while (fits(chars.length * 2) && (2 * Math.PI * r) / (chars.length * 0.62) > 7.4) chars = [...chars, ...ring];
  const fs = Math.min(7.4, Math.max(4.6, (2 * Math.PI * r) / (chars.length * 0.62)));
  const col = C.stamp;
  const ringBox = (inset: number, bw: number) => (
    <View style={{ position: "absolute", top: inset, left: inset, width: size - inset * 2, height: size - inset * 2, borderRadius: (size - inset * 2) / 2, borderWidth: bw, borderColor: col }} />
  );
  return (
    <View style={{ width: size, height: size, position: "relative", opacity: 0.88, transform: "rotate(-12deg)" }}>
      {ringBox(0, 1.8)}{ringBox(3, 0.5)}{ringBox(17, 0.8)}
      {chars.map((ch, i) => {
        const t = (i / chars.length) * 2 * Math.PI; // 0 — верх, по часовой
        const cx = size / 2 + r * Math.sin(t), cy = size / 2 - r * Math.cos(t);
        return (
          <Text key={i} style={{ position: "absolute", left: cx - 4, top: cy - fs * 0.6, width: 8, textAlign: "center",
            fontSize: fs, fontWeight: 700, color: col, lineHeight: 1.2, transform: `rotate(${(t * 180) / Math.PI}deg)` }}>{ch}</Text>
        );
      })}
      <View style={{ position: "absolute", top: size / 2 - 16, left: 18, width: size - 36, alignItems: "center" }}>
        <Text style={{ fontSize: 6, color: col, letterSpacing: 2 }}>• • •</Text>
        <Text style={{ fontSize: 11, fontWeight: 700, color: col, lineHeight: 1.15 }}>{company.name || "Electro Demo"}</Text>
        <Text style={{ fontSize: 5, color: col, marginTop: 1, letterSpacing: 0.5 }}>ДЛЯ ДОКУМЕНТОВ</Text>
      </View>
    </View>
  );
}

/** Подписи сторон. Слева — наша сторона: факсимиле подписи и печать (по настройкам компании) */
export function Signatures({ left, right, company, leftName }: { left: string; right: string; company?: DocCompany; leftName?: string | null }) {
  const mode = company?.stamp ?? "none";
  const stamp = !company || mode === "none" ? null
    : mode === "image" && company.stampImg
      // eslint-disable-next-line jsx-a11y/alt-text
      ? <Image src={{ data: company.stampImg, format: "png" }} style={{ width: 104, height: 104, objectFit: "contain", opacity: 0.92 }} />
      : <Stamp company={company} />;
  const name = leftName ?? company?.director ?? "";
  return (
    <View style={s.sign} wrap={false}>
      <View style={s.signCol}>
        <Text style={s.bold}>{left}</Text>
        <View style={s.signLine} />
        <Text style={s.muted}>подпись / ФИО{name ? `: ${name}` : ""}</Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {company?.signImg ? <Image src={{ data: company.signImg, format: "png" }} style={{ position: "absolute", left: 30, top: 4, width: 90, height: 34, objectFit: "contain" }} /> : null}
        {stamp ? <View style={{ position: "absolute", left: 112, top: -14 }}>{stamp}</View> : <Text style={[s.muted, { marginTop: 6 }]}>М.П.</Text>}
      </View>
      <View style={s.signCol}><Text style={s.bold}>{right}</Text><View style={s.signLine} /><Text style={s.muted}>подпись / ФИО</Text></View>
    </View>
  );
}

export async function renderPdf(title: string, children: ReactNode, opts: { landscape?: boolean } = {}) {
  fonts();
  const doc = () => (
    <Document title={title} author="Electro Demo CRM" language="ru">
      <Page size="A4" orientation={opts.landscape ? "landscape" : "portrait"} style={s.page}>{children}</Page>
    </Document>
  );
  try {
    return await renderToBuffer(doc());
  } catch (e) {
    // react-pdf: нумерация через render={…} в fixed-колонтитуле ломает раскладку документов длиннее ~15 страниц
    // («unsupported number: -1.6e+22»). Такие документы собираем без «стр. N из M».
    if (!/unsupported number/i.test((e as Error).message)) throw e;
    return noPageNumbers.run(true, () => renderToBuffer(doc()));
  }
}

export const PDF = "application/pdf";
