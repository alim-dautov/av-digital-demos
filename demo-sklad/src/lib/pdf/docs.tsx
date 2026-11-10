import "server-only";
import { Text, View } from "@react-pdf/renderer";
import { fmtDate, money, num } from "@/lib/format";
import { moneyInWords } from "@/lib/words";
import type { CompanySettings } from "@/modules/settings/store";
import type { Payslip } from "@/modules/payroll/types";
import { Brand, Footer, Parties, Signatures, Table, Totals, renderPdf, s, C, type DocCompany } from "./kit";

type Line = { name: string; unit: string; qty: number; price: number };
type QLine = Line & { sum: number };

/** Метка отправленной версии: номер, время и что изменилось относительно предыдущей */
export type VersionMark = { n: number; at: Date; changes: string[]; prev?: number };

/** Колонки строк документа: № · Наименование · Ед. изм. · Количество · Цена · Сумма */
function lineCols<T extends Line>(sum: (r: T) => number) {
  return [
    { title: "№", width: 20, cell: (_: T, i: number) => String(i + 1) },
    { title: "Наименование", width: "*" as const, cell: (r: T) => r.name },
    { title: "Ед. изм.", width: 50, cell: (r: T) => r.unit },
    { title: "Количество", width: 58, right: true, cell: (r: T) => num(r.qty) },
    { title: "Цена", width: 72, right: true, cell: (r: T) => money(r.price) },
    { title: "Сумма", width: 82, right: true, cell: (r: T) => money(sum(r)) },
  ];
}

function VersionSub({ v }: { v?: VersionMark }) {
  if (!v) return null;
  return <Text style={[s.muted, { marginTop: -6, marginBottom: 8 }]}>Версия {v.n} · сформирована {fmtDate(v.at, true)}{v.prev ? ` · заменяет версию ${v.prev}` : ""}</Text>;
}
function VersionChanges({ v }: { v?: VersionMark }) {
  if (!v?.prev || !v.changes.length) return null;
  const shown = v.changes.slice(0, 20);
  return (
    <View style={[s.box, { marginTop: 10 }]} wrap={false}>
      <Text style={s.bold}>Изменения относительно версии {v.prev}</Text>
      {shown.map((c, i) => <Text key={i}>• {c}</Text>)}
      {v.changes.length > shown.length ? <Text style={s.muted}>… и ещё {v.changes.length - shown.length}</Text> : null}
    </View>
  );
}

/** Расходная накладная / возврат */
export function shipmentPdf(company: DocCompany, d: { kind: string; number: number; date: string; client: { name: string; phone: string | null; details?: string | null }; orderNumber?: number | null; items: Line[]; total: number; comment?: string; version?: VersionMark }) {
  const ret = d.kind === "return";
  const title = `${ret ? "Возврат от покупателя" : "Расходная накладная"} №${d.number} от ${fmtDate(d.date)}`;
  return renderPdf(title, <>
    <Brand company={company} />
    <Text style={s.h1}>{title}</Text>
    <Text style={s.sub}>{d.orderNumber ? `по заявке №${d.orderNumber}` : " "}</Text>
    <VersionSub v={d.version} />
    <Parties items={[
      { label: "Поставщик", name: company.legalName || company.name, lines: [company.bin && `БИН ${company.bin}`, company.address, company.phone] },
      { label: "Покупатель", name: d.client.name, lines: [d.client.details, d.client.phone] },
    ]} />
    <Table<Line> rows={d.items} cols={[
      ...lineCols<Line>((r) => Math.round(r.qty * r.price)),
    ]} />
    <Totals rows={[["Позиций", String(d.items.length)], ["Итого", money(d.total), true]]} />
    <Text style={{ marginTop: 6 }}><Text style={s.muted}>Сумма прописью: </Text>{moneyInWords(d.total)}</Text>
    {d.comment ? <Text style={[s.muted, { marginTop: 4 }]}>Комментарий: {d.comment}</Text> : null}
    <VersionChanges v={d.version} />
    <Signatures left={ret ? "Принял" : "Отпустил"} right={ret ? "Сдал" : "Получил"} company={company} />
    <Footer left={`${company.name} · ${title}`} />
  </>);
}

/** Заказ покупателя (заявка): позиции, скидка, итог — для отправки клиенту */
export function orderPdf(company: DocCompany, d: { number: number; date: Date | string; client: { name: string; phone: string | null; details?: string | null }; deliveryDate: string | null; items: Line[]; discountPct: number; total: number; comment?: string; manager?: string | null; version?: VersionMark }) {
  const title = `Заказ покупателя №${d.number} от ${fmtDate(d.date)}`;
  const sum = d.items.reduce((a, r) => a + Math.round(r.qty * r.price), 0);
  return renderPdf(title, <>
    <Brand company={company} />
    <Text style={s.h1}>{title}</Text>
    <Text style={s.sub}>{d.deliveryDate ? `доставка ${fmtDate(d.deliveryDate)}` : " "}</Text>
    <VersionSub v={d.version} />
    <Parties items={[
      { label: "Поставщик", name: company.legalName || company.name, lines: [company.bin && `БИН ${company.bin}`, company.address, company.phone] },
      { label: "Покупатель", name: d.client.name, lines: [d.client.details, d.client.phone] },
    ]} />
    <Table<Line> rows={d.items} cols={lineCols<Line>((r) => Math.round(r.qty * r.price))} />
    <Totals rows={[
      ["Позиций", String(d.items.length)],
      ...(d.discountPct ? [["Сумма", money(sum)], [`Скидка ${num(d.discountPct)}%`, `−${money(sum - d.total)}`]] as [string, string][] : []),
      ["Итого", money(d.total), true],
    ]} />
    <Text style={{ marginTop: 6 }}><Text style={s.muted}>Сумма прописью: </Text>{moneyInWords(d.total)}</Text>
    {d.comment ? <Text style={[s.muted, { marginTop: 4 }]}>Комментарий: {d.comment}</Text> : null}
    <VersionChanges v={d.version} />
    {d.manager ? <Text style={{ marginTop: 12 }}><Text style={s.muted}>Менеджер: </Text>{d.manager}</Text> : null}
    <Signatures left="Поставщик" right="Покупатель" company={company} />
    <Footer left={`${company.name} · ${title}`} />
  </>);
}

type Recon = { counterparty: { name: string }; from: string; to: string; side: string; opening: number; rows: { date: string; doc: string; debit: number; credit: number }[]; debit: number; credit: number; closing: number };
export function reconPdf(company: DocCompany, r: Recon) {
  const title = `Акт сверки взаиморасчётов за ${fmtDate(r.from)} – ${fmtDate(r.to)}`;
  const who = r.side === "client" ? "покупателя" : "поставщика";
  const tail = r.closing === 0 ? "Задолженность отсутствует." : r.side === "client"
    ? (r.closing > 0 ? `Задолженность ${r.counterparty.name} перед ${company.name}: ${money(r.closing)}` : `Задолженность ${company.name} перед ${r.counterparty.name}: ${money(-r.closing)}`)
    : (r.closing < 0 ? `Задолженность ${company.name} перед ${r.counterparty.name}: ${money(-r.closing)}` : `Переплата поставщику: ${money(r.closing)}`);
  return renderPdf(title, <>
    <Brand company={company} />
    <Text style={s.h1}>{title}</Text>
    <Text style={s.sub}>между {company.legalName || company.name} и {r.counterparty.name} (сторона {who})</Text>
    <Table rows={[{ date: "", doc: "Сальдо на начало", debit: r.opening > 0 ? r.opening : 0, credit: r.opening < 0 ? -r.opening : 0 }, ...r.rows]}
      cols={[
        { title: "Дата", width: 62, cell: (x) => (x.date ? fmtDate(x.date) : "") },
        { title: "Документ", width: "*", cell: (x) => x.doc },
        { title: "Дебет", width: 90, right: true, cell: (x) => (x.debit ? money(x.debit) : "") },
        { title: "Кредит", width: 90, right: true, cell: (x) => (x.credit ? money(x.credit) : "") },
      ]}
      foot={["", "Обороты за период", money(r.debit), money(r.credit)]} />
    <Totals rows={[["Сальдо на конец", money(r.closing), true]]} />
    <Text style={[s.bold, { marginTop: 8 }]}>{tail}</Text>
    <Signatures left={`От ${company.name}`} right={`От ${r.counterparty.name}`} company={company} />
    <Footer left={`${company.name} · акт сверки · ${r.counterparty.name}`} />
  </>);
}

export type PLRow = { folder: string; name: string; sku: string | null; unit: string; price: number; stock: number | null };
/** Прайс-лист: по папкам; showStock — наличие (да/нет/под заказ) */
export function priceListPdf(company: CompanySettings, d: { title: string; priceName: string; date: string; rows: PLRow[]; showStock: boolean; note?: string }) {
  const groups = new Map<string, PLRow[]>();
  for (const r of d.rows) { const g = groups.get(r.folder) ?? []; g.push(r); groups.set(r.folder, g); }
  return renderPdf(d.title, <>
    <Brand company={company} />
    <Text style={s.h1}>{d.title}</Text>
    <Text style={s.sub}>{d.priceName} · цены действительны на {fmtDate(d.date)}{d.note ? ` · ${d.note}` : ""}</Text>
    {[...groups.entries()].map(([folder, rows]) => (
      <View key={folder} style={{ marginBottom: 8 }}>
        <Text style={{ fontWeight: 700, color: C.navy, fontSize: 10, marginBottom: 3 }} minPresenceAhead={40}>{folder}</Text>
        <Table<PLRow> rows={rows} cols={[
          { title: "Наименование", width: "*", cell: (r) => r.name },
          { title: "Артикул", width: 70, cell: (r) => r.sku ?? "" },
          { title: "Ед.", width: 30, cell: (r) => r.unit },
          ...(d.showStock ? [{ title: "Наличие", width: 58, cell: (r: PLRow) => (r.stock == null ? "" : r.stock > 0 ? "есть" : "под заказ") }] : []),
          { title: "Цена", width: 72, right: true, cell: (r) => money(r.price) },
        ]} />
      </View>
    ))}
    <Footer left={`${company.name} · ${company.phone || ""} · ${d.priceName}`} />
  </>);
}

/** Коммерческое предложение: наценка уже в ценах, отдельно не показывается */
export function quotePdf(company: DocCompany, d: { number: number; date: string; clientName: string; clientDetails: string; objectName: string; validUntil: string | null; terms: string; lines: QLine[]; total: number; author: { name: string; phone: string | null } | null; version?: VersionMark }) {
  const title = `Коммерческое предложение №${d.number}`;
  return renderPdf(title, <>
    <Brand company={company} />
    <Text style={s.h1}>{title}</Text>
    <Text style={s.sub}>от {fmtDate(d.date)}{d.validUntil ? ` · действительно до ${fmtDate(d.validUntil)}` : ""}</Text>
    <VersionSub v={d.version} />
    <Parties items={[
      { label: "От кого", name: company.legalName || company.name, lines: [company.phone, d.author && `Менеджер: ${d.author.name}${d.author.phone ? `, ${d.author.phone}` : ""}`] },
      { label: "Кому", name: d.clientName || "—", lines: [d.clientDetails, d.objectName && `Объект: ${d.objectName}`] },
    ]} />
    <Table rows={d.lines} cols={[
      ...lineCols<QLine>((r) => r.sum),
    ]} />
    <Totals rows={[["Итого", money(d.total), true]]} />
    <Text style={{ marginTop: 4 }}><Text style={s.muted}>Сумма прописью: </Text>{moneyInWords(d.total)}</Text>
    <VersionChanges v={d.version} />
    {d.terms ? <View style={[s.box, { marginTop: 10 }]}><Text style={s.bold}>Условия</Text><Text>{d.terms}</Text></View> : null}
    <Signatures left="Поставщик" right="Покупатель" company={company} />
    <Footer left={`${company.name} · ${title}`} />
  </>);
}

export function payslipPdf(company: CompanySettings, name: string, slip: Payslip & { closed?: boolean }) {
  const title = `Расчётный лист: ${name}`;
  return renderPdf(title, <>
    <Brand company={company} />
    <Text style={s.h1}>{title}</Text>
    <Text style={s.sub}>Период: {slip.period.label} ({fmtDate(slip.period.start)} – {fmtDate(slip.period.end)}){slip.closed ? " · период закрыт" : " · предварительный расчёт"}</Text>
    {slip.lines.map((l) => (
      <View key={l.code + l.label} style={{ marginBottom: 8 }} wrap={false}>
        <View style={[s.totalRow, { borderBottomWidth: 0.6, borderColor: C.line }]}><Text style={s.bold}>{l.label}</Text><Text style={s.bold}>{money(l.amount)}</Text></View>
        {l.details.slice(0, 60).map((x, i) => (
          <View key={i} style={[s.totalRow, { paddingLeft: 8 }]}><Text style={[s.muted, { flex: 1 }]}>{x.label}{x.note ? ` · ${x.note}` : ""}</Text><Text style={s.muted}>{x.amount != null ? money(x.amount) : ""}</Text></View>
        ))}
        {l.details.length > 60 ? <Text style={[s.muted, { paddingLeft: 8 }]}>… и ещё {l.details.length - 60} строк</Text> : null}
      </View>
    ))}
    <Totals rows={[
      ["Начислено", money(slip.accrued), true],
      ...(slip.carryIn ? [["Перенос с прошлого периода", money(slip.carryIn)] as [string, string]] : []),
      ["Аванс", money(-slip.advances)],
      ["Выплачено", money(-slip.payouts)],
      [slip.balanceAfterPayouts < 0 ? "Переплата" : "К выплате", money(slip.balanceAfterPayouts), true],
    ]} />
    {slip.notes.length ? <View style={{ marginTop: 8 }}>{slip.notes.map((n, i) => <Text key={i} style={s.muted}>• {n}</Text>)}</View> : null}
    <Signatures left="Бухгалтер" right="Сотрудник" />
    <Footer left={`${company.name} · расчётный лист · ${slip.period.label}`} />
  </>);
}

/** Универсальный отчёт-таблица (аналитика): ячейки уже отформатированы */
export function reportPdf(company: CompanySettings, d: { title: string; subtitle: string; cols: { title: string; right?: boolean; width?: number }[]; rows: string[][]; foot?: string[] }) {
  return renderPdf(d.title, <>
    <Brand company={company} />
    <Text style={s.h1}>{d.title}</Text>
    <Text style={s.sub}>{d.subtitle}</Text>
    <Table<string[]> rows={d.rows} foot={d.foot} cols={d.cols.map((c, i) => ({ title: c.title, right: c.right, width: c.width ?? (i === 0 ? "*" : 80), cell: (r) => r[i] ?? "" }))} />
    <Footer left={`${company.name} · ${d.title} · ${d.subtitle}`} />
  </>, { landscape: d.cols.length > 6 });
}
