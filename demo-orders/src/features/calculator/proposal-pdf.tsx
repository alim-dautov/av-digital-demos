import path from "path";
import {
  Document,
  Font,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ProposalDocument } from "@/lib/domain/atelier-calc";
import type { RenovationProposalDocument } from "@/lib/domain/renovation/quote";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Geist",
  fonts: [
    { src: path.join(FONT_DIR, "Geist-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Geist-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(FONT_DIR, "Geist-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export type ProposalPdfItem = {
  name: string;
  qty: number;
  specs: string;
  price: number;
};

export type ProposalPdfData = {
  number: string;
  createdAt: string;
  companyName: string;
  companyTagline: string;
  /** Absolute path to a PNG/JPG; replaces the text company name in the header. */
  logoFile?: string | null;
  clientName: string | null;
  clientPhone: string | null;
  address?: string | null;
  orderNumber?: string | null;
  items: ProposalPdfItem[];
  /** Grouped textiles document; falls back to flat items when absent */
  document?: ProposalDocument | null;
  /** Block-based renovation document (Компания 3) */
  renovation?: RenovationProposalDocument | null;
  total: number;
  terms: string;
  deadlineDays: number;
  accent?: string;
  contacts: {
    phone?: string;
    email?: string;
    address?: string;
  };
  photos?: { src: string; name: string }[];
};

/** Geist has no tenge glyph, so PDF uses the textual currency. */
function money(n: number): string {
  return (
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
      .format(Math.round(n))
      .replace(/\u202f|\u00a0/g, " ") + " тг"
  );
}

function qtyText(qty: number, unit?: string) {
  const n = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })
    .format(qty)
    .replace(/\u202f|\u00a0/g, " ");
  return unit ? `${n} ${unit}` : n;
}

function formatDatePdf(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function makeStyles(accent: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingBottom: 56,
      paddingHorizontal: 40,
      fontSize: 9.5,
      fontFamily: "Geist",
      color: "#1a1a1a",
      backgroundColor: "#ffffff",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingBottom: 16,
      borderBottomWidth: 2,
      borderBottomColor: accent,
    },
    brand: { fontSize: 22, fontWeight: 700, letterSpacing: 0.5, color: "#0a0a0a" },
    tagline: { marginTop: 3, fontSize: 9, color: "#666666" },
    logo: { width: 180, marginTop: -8, marginBottom: -6 },
    meta: { alignItems: "flex-end" },
    metaLabel: { fontSize: 7.5, color: "#888888", textTransform: "uppercase", letterSpacing: 0.8 },
    metaValue: { marginTop: 2, fontSize: 13, fontWeight: 700 },
    metaSub: { marginTop: 3, color: "#666666" },
    infoRow: { flexDirection: "row", marginTop: 18, gap: 12 },
    infoCard: { flex: 1, backgroundColor: "#f6f6f3", padding: 12, borderRadius: 4 },
    infoLabel: { fontSize: 7.5, color: "#888888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
    infoMain: { fontSize: 11.5, fontWeight: 600 },
    infoSub: { marginTop: 3, color: "#555555" },
    sectionHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 18,
      paddingBottom: 5,
      borderBottomWidth: 1,
      borderBottomColor: "#111111",
    },
    roomHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 24,
      paddingBottom: 6,
      borderBottomWidth: 2,
      borderBottomColor: accent,
    },
    roomTitle: { fontSize: 14, fontWeight: 700 },
    roomSum: { fontSize: 12, fontWeight: 700 },
    roomBreakdown: { marginTop: 4, fontSize: 8.5, color: "#666666" },
    sectionTitle: { fontSize: 11, fontWeight: 700 },
    sectionSum: { fontSize: 9.5, fontWeight: 600, color: "#444444" },
    tableHeader: {
      flexDirection: "row",
      paddingVertical: 5,
      paddingHorizontal: 6,
      marginTop: 14,
      backgroundColor: "#111111",
      color: "#ffffff",
    },
    th: { fontSize: 7.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
    row: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: "#dddddd",
      paddingVertical: 7,
      paddingHorizontal: 6,
    },
    colName: { width: "32%", paddingRight: 8 },
    colSpecs: { width: "38%", paddingRight: 8, color: "#555555" },
    colQty: { width: "12%", textAlign: "right" },
    colPrice: { width: "18%", textAlign: "right", fontWeight: 600 },
    rowName: { fontWeight: 600 },
    totals: { marginTop: 20, alignSelf: "flex-end", width: "62%" },
    totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    totalMuted: { color: "#666666" },
    grand: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 6,
      padding: 10,
      backgroundColor: "#111111",
      color: "#ffffff",
      borderRadius: 4,
    },
    grandLabel: { fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8 },
    grandValue: { fontSize: 16, fontWeight: 700, color: accent },
    photoTitle: { marginTop: 18, fontSize: 11, fontWeight: 700 },
    photoGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 },
    photoCell: { width: "31%" },
    photo: { width: "100%", height: 110, objectFit: "cover" },
    photoName: { marginTop: 2, fontSize: 7.5, color: "#666666" },
    termsTitle: { marginTop: 22, fontSize: 7.5, color: "#888888", textTransform: "uppercase", letterSpacing: 0.8 },
    terms: { marginTop: 4, lineHeight: 1.5, color: "#333333" },
    deadline: { marginTop: 10, padding: 10, backgroundColor: "#f6f6f3", borderLeftWidth: 3, borderLeftColor: accent },
    contacts: { marginTop: 22, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#cccccc", flexDirection: "row", gap: 18, color: "#555555" },
    footer: {
      position: "absolute",
      bottom: 26,
      left: 40,
      right: 40,
      fontSize: 7.5,
      color: "#999999",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    blockItems: { marginTop: 4, fontSize: 8.5, color: "#555555", lineHeight: 1.4 },
    blockComment: { marginTop: 3, fontSize: 8.5, color: "#666666" },
    stagesTitle: {
      marginTop: 22,
      fontSize: 11,
      fontWeight: 700,
      paddingBottom: 5,
      borderBottomWidth: 1,
      borderBottomColor: "#111111",
    },
    stageRow: { flexDirection: "row", gap: 8, paddingVertical: 3 },
    stageNum: { width: 18, fontWeight: 600 },
    stageText: { flex: 1, color: "#333333" },
  });
}

export function ProposalPdfDocument({ data }: { data: ProposalPdfData }) {
  const s = makeStyles(data.accent ?? "#E98C55");
  const doc = data.document;
  const renovation = data.renovation;

  const tableHeader = (
    <View style={s.tableHeader} fixed>
      <Text style={[s.th, s.colName]}>Наименование</Text>
      <Text style={[s.th, s.colSpecs]}>Размеры и характеристики</Text>
      <Text style={[s.th, s.colQty]}>Кол-во</Text>
      <Text style={[s.th, s.colPrice]}>Сумма</Text>
    </View>
  );

  return (
    <Document title={`${data.number} — ${data.companyName}`} author={data.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {data.logoFile ? (
            <Image src={data.logoFile} style={s.logo} />
          ) : (
            <View>
              <Text style={s.brand}>{data.companyName}</Text>
              {data.companyTagline ? <Text style={s.tagline}>{data.companyTagline}</Text> : null}
            </View>
          )}
          <View style={s.meta}>
            <Text style={s.metaLabel}>Коммерческое предложение</Text>
            <Text style={s.metaValue}>{data.number}</Text>
            <Text style={s.metaSub}>от {formatDatePdf(data.createdAt)}</Text>
            {data.orderNumber ? <Text style={s.metaSub}>Заказ {data.orderNumber}</Text> : null}
          </View>
        </View>

        <View style={s.infoRow}>
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>Клиент</Text>
            <Text style={s.infoMain}>{data.clientName || "Клиент не указан"}</Text>
            {data.clientPhone ? <Text style={s.infoSub}>{data.clientPhone}</Text> : null}
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>Адрес объекта</Text>
            <Text style={s.infoMain}>{data.address || "Не указан"}</Text>
            {doc?.measurementDate ? (
              <Text style={s.infoSub}>Дата замера: {formatDatePdf(doc.measurementDate)}</Text>
            ) : null}
          </View>
        </View>

        {renovation ? (
          renovation.sections.map((section) => (
            <View key={section.key}>
              <View style={s.roomHead} wrap={false} minPresenceAhead={60}>
                <Text style={s.roomTitle}>{section.title}</Text>
                <Text style={s.roomSum}>{money(section.subtotal)}</Text>
              </View>
              {section.blocks.map((block) => (
                <View key={block.id}>
                  <View style={s.sectionHead} wrap={false} minPresenceAhead={40}>
                    <Text style={s.sectionTitle}>{block.title}</Text>
                    <Text style={s.sectionSum}>{money(block.subtotal)}</Text>
                  </View>
                  {block.items.map((item) => (
                    <View key={item.id} style={s.row} wrap={false}>
                      <Text style={[s.colName, s.rowName]}>{item.label}</Text>
                      <Text style={s.colSpecs}>{item.comment || "—"}</Text>
                      <Text style={s.colQty}>1</Text>
                      <Text style={s.colPrice}>{money(item.price)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))
        ) : doc ? (
          doc.rooms.map((room, ri) => (
            <View key={`room-${ri}`}>
              <View style={s.roomHead} wrap={false} minPresenceAhead={60}>
                <Text style={s.roomTitle}>{room.name}</Text>
                <Text style={s.roomSum}>{money(room.subtotal)}</Text>
              </View>
              <Text style={s.roomBreakdown}>
                Материалы {money(room.breakdown.materials)} · пошив {money(room.breakdown.sewing)} ·
                доп. элементы {money(room.breakdown.extras)}
              </Text>
              {room.sections.map((section) => (
                <View key={`${ri}-${section.title}`}>
                  <View style={s.sectionHead} wrap={false} minPresenceAhead={40}>
                    <Text style={s.sectionTitle}>{section.title}</Text>
                    <Text style={s.sectionSum}>{money(section.subtotal)}</Text>
                  </View>
                  {section.rows.map((r, i) => (
                    <View key={`${ri}-${section.title}-${i}`} style={s.row} wrap={false}>
                      <View style={{ width: "72%", paddingRight: 8 }}>
                        <Text style={s.rowName}>{r.name}</Text>
                        {r.specs ? <Text style={{ marginTop: 2, color: "#555555" }}>{r.specs}</Text> : null}
                      </View>
                      <Text style={[s.colPrice, { width: "28%" }]}>{money(r.price)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))
        ) : (
          <>
            {tableHeader}
            {data.items.map((item, i) => (
              <View key={`${item.name}-${i}`} style={s.row} wrap={false}>
                <Text style={[s.colName, s.rowName]}>{item.name}</Text>
                <Text style={s.colSpecs}>{item.specs || "—"}</Text>
                <Text style={s.colQty}>{qtyText(item.qty)}</Text>
                <Text style={s.colPrice}>{money(item.price)}</Text>
              </View>
            ))}
          </>
        )}

        <View style={s.totals} wrap={false}>
          {doc
            ? doc.rooms.map((room, index) => (
                <View key={`${room.name}-${index}`} style={s.totalLine}>
                  <Text style={s.totalMuted}>{room.name}</Text>
                  <Text>{money(room.subtotal)}</Text>
                </View>
              ))
            : null}
          {doc && doc.discountPercent > 0 ? (
            <>
              <View style={s.totalLine}>
                <Text style={s.totalMuted}>Стоимость</Text>
                <Text>{money(doc.subtotal)}</Text>
              </View>
              <View style={s.totalLine}>
                <Text style={s.totalMuted}>Скидка {doc.discountPercent}%</Text>
                <Text>−{money(doc.discountAmount)}</Text>
              </View>
            </>
          ) : null}
          <View style={s.grand}>
            <Text style={s.grandLabel}>Итого к оплате</Text>
            <Text style={s.grandValue}>{money(data.total)}</Text>
          </View>
        </View>

        {renovation ? (
          <View>
            <Text style={s.stagesTitle}>Порядок работ</Text>
            {renovation.stages.map((stage, i) => (
              <View key={stage} style={s.stageRow} wrap={false}>
                <Text style={s.stageNum}>{i + 1}.</Text>
                <Text style={s.stageText}>{stage}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.photos && data.photos.length > 0 ? (
          <View wrap={false}>
            <Text style={s.photoTitle}>Фото</Text>
            <View style={s.photoGrid}>
              {data.photos.map((photo) => (
                <View key={photo.src} style={s.photoCell}>
                  <Image src={photo.src} style={s.photo} />
                  <Text style={s.photoName}>{photo.name}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View wrap={false}>
          <Text style={s.termsTitle}>Условия</Text>
          <Text style={s.terms}>{data.terms}</Text>
          <View style={s.deadline}>
            <Text style={{ fontWeight: 600 }}>
              {renovation ? "Срок выполнения" : "Срок изготовления"}: {data.deadlineDays}{" "}
              {data.deadlineDays % 10 === 1 && data.deadlineDays % 100 !== 11
                ? "день"
                : [2, 3, 4].includes(data.deadlineDays % 10) && ![12, 13, 14].includes(data.deadlineDays % 100)
                  ? "дня"
                  : "дней"}
            </Text>
            <Text style={{ marginTop: 3, color: "#555555", fontSize: 8.5 }}>
              {renovation
                ? "Срок уточняется после осмотра объекта."
                : "Срок уточняется после замера."}
            </Text>
          </View>
        </View>

        <View style={s.contacts} wrap={false}>
          {data.contacts.phone ? <Text>Тел.: {data.contacts.phone}</Text> : null}
          {data.contacts.email ? <Text>{data.contacts.email}</Text> : null}
          {data.contacts.address ? <Text>{data.contacts.address}</Text> : null}
        </View>

        <View style={s.footer} fixed>
          <Text>
            {data.companyName} · {data.number}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `стр. ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
