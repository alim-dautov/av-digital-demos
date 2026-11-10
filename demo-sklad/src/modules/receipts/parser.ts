/**
 * Распознавание позиций накладной/счёта. Абстракция ReceiptParser:
 *  - XlsxParser — Excel (ищет колонки «наименование/кол-во/цена»),
 *  - TextParser — вставленный текст (тот же разборщик, что и у заявок),
 *  - ClaudeParser — PDF/фото через Claude API (если задан ANTHROPIC_API_KEY).
 * Результат затем сопоставляется с каталогом товаров.
 */
import { parseList } from "@/modules/orders/parse";

export type ParsedReceiptLine = { name: string; qty: number; unit: string | null; price: number | null /* ₸ за единицу */ };
export type ParsedReceipt = { lines: ParsedReceiptLine[]; supplierName?: string | null; docNumber?: string | null; docDate?: string | null; engine: string };

export interface ReceiptParser {
  canParse(mime: string, name: string): boolean;
  parse(file: { name: string; mime: string; data: Buffer }): Promise<ParsedReceipt>;
}

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) return Number((v as { result: unknown }).result) || 0;
  return Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")) || 0;
};

export class XlsxParser implements ReceiptParser {
  canParse(mime: string, name: string) { return /sheet|excel/.test(mime) || /\.xlsx$/i.test(name); }
  async parse(file: { data: Buffer }): Promise<ParsedReceipt> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.data as never);
    const ws = wb.worksheets[0];
    if (!ws) return { lines: [], engine: "xlsx" };
    let header = -1, cName = -1, cQty = -1, cPrice = -1, cUnit = -1;
    ws.eachRow((row, idx) => {
      if (header > 0) return;
      row.eachCell((cell, col) => {
        const t = String(cell.text ?? "").toLowerCase();
        if (/наимен|товар|номенклат|назван/.test(t)) cName = col;
        else if (/кол|qty/.test(t)) cQty = col;
        else if (/цена|price/.test(t) && cPrice < 0) cPrice = col;
        else if (/ед\.?|изм/.test(t)) cUnit = col;
      });
      if (cName > 0 && cQty > 0) header = idx;
    });
    if (header < 0) return { lines: [], engine: "xlsx" };
    const lines: ParsedReceiptLine[] = [];
    ws.eachRow((row, idx) => {
      if (idx <= header) return;
      const name = String(row.getCell(cName).text ?? "").trim();
      const qty = num(row.getCell(cQty).value);
      if (!name || !(qty > 0) || /^итого/i.test(name)) return;
      lines.push({ name, qty, unit: cUnit > 0 ? String(row.getCell(cUnit).text || "") || null : null, price: cPrice > 0 ? num(row.getCell(cPrice).value) || null : null });
    });
    return { lines, engine: "xlsx" };
  }
}

export class TextParser implements ReceiptParser {
  canParse(mime: string) { return mime.startsWith("text/"); }
  async parse(file: { data: Buffer }): Promise<ParsedReceipt> {
    return { lines: parseList(file.data.toString("utf8")).map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price })), engine: "text" };
  }
}

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplierName", "docNumber", "docDate", "lines"],
  properties: {
    supplierName: { type: ["string", "null"] },
    docNumber: { type: ["string", "null"] },
    docDate: { type: ["string", "null"], description: "YYYY-MM-DD" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "qty", "unit", "price"],
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unit: { type: ["string", "null"] },
          price: { type: ["number", "null"], description: "Цена за единицу в тенге" },
        },
      },
    },
  },
} as const;

export class ClaudeParser implements ReceiptParser {
  canParse(mime: string) { return !!process.env.ANTHROPIC_API_KEY && (mime === "application/pdf" || mime.startsWith("image/")); }
  async parse(file: { name: string; mime: string; data: Buffer }): Promise<ParsedReceipt> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const data = file.data.toString("base64");
    const source = file.mime === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: file.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data } };
    const res = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: { type: "json_schema", schema: RECEIPT_SCHEMA as unknown as Record<string, unknown> } },
      messages: [{
        role: "user",
        content: [
          source,
          { type: "text", text: "Это накладная или счёт поставщика (Казахстан, тенге). Извлеки все товарные позиции: наименование как в документе, количество, единицу измерения и цену за единицу в тенге (без НДС, если указаны обе — бери цену с НДС, по которой идёт итог). Строки «Итого», доставку и услуги не включай." },
        ],
      }],
    });
    if (res.stop_reason === "refusal") throw new Error("Модель отказалась обрабатывать документ");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Пустой ответ распознавания");
    const parsed = JSON.parse(text.text) as Omit<ParsedReceipt, "engine">;
    return { ...parsed, lines: (parsed.lines ?? []).filter((l) => l.name && l.qty > 0), engine: "claude" };
  }
}

const parsers: ReceiptParser[] = [new XlsxParser(), new TextParser(), new ClaudeParser()];

export async function parseReceiptFile(file: { name: string; mime: string; data: Buffer }): Promise<ParsedReceipt> {
  const p = parsers.find((x) => x.canParse(file.mime, file.name));
  if (!p) {
    throw Object.assign(new Error(
      file.mime === "application/pdf" || file.mime.startsWith("image/")
        ? "Автораспознавание PDF/фото доступно при заданном ANTHROPIC_API_KEY. Сейчас скопируйте текст из накладной и вставьте в поле «Разобрать текст»."
        : "Формат не поддерживается: загрузите xlsx, PDF или вставьте текст",
    ), { status: 400 });
  }
  return p.parse(file);
}
