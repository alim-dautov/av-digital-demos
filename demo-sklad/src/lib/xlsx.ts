import "server-only";
import ExcelJS from "exceljs";

export type XCol = { header: string; width?: number; money?: boolean };
/** Денежные колонки передаются в тиынах — в файле это тенге с форматом «# ##0» */
export async function sheetsBuffer(sheets: { name: string; cols: XCol[]; rows: (string | number | null)[][]; title?: string }[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Electro Demo CRM";
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: "frozen", ySplit: sh.title ? 2 : 1 }] });
    if (sh.title) { ws.addRow([sh.title]).font = { bold: true, size: 13 }; }
    const head = ws.addRow(sh.cols.map((c) => c.header));
    head.font = { bold: true };
    head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } }; });
    sh.cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 16; if (c.money) ws.getColumn(i + 1).numFmt = "# ##0.##"; });
    for (const r of sh.rows) ws.addRow(r.map((v, i) => (sh.cols[i]?.money && typeof v === "number" ? v / 100 : v)));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
