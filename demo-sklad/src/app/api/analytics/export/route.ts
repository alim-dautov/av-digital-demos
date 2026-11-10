import { withUser, fileResponse, XLSX } from "@/lib/http";
import { fmtDate } from "@/lib/format";
import { PDF } from "@/lib/pdf/kit";
import { reportPdf } from "@/lib/pdf/docs";
import { sheetsBuffer } from "@/lib/xlsx";
import { buildReport, formatReport, DIMS, type Dim, type ReportKey } from "@/modules/analytics/reports";
import { defaultRange } from "@/modules/analytics/service";
import { getSetting } from "@/modules/settings/store";

export const runtime = "nodejs";
const KEYS: ReportKey[] = ["sales", "margin", "segments", "managers", "abc", "tasks"];
const D = /^\d{4}-\d{2}-\d{2}$/;

/** /api/analytics/export?report=margin&dim=client&from=&to=&format=xlsx|pdf */
export const GET = withUser(async (req, { db, p }) => {
  const u = new URL(req.url).searchParams;
  const key = (KEYS.includes(u.get("report") as ReportKey) ? u.get("report") : "sales") as ReportKey;
  const dim = (u.get("dim") && u.get("dim")! in DIMS ? u.get("dim") : "client") as Dim;
  const rg = defaultRange();
  const from = D.test(u.get("from") ?? "") ? u.get("from")! : rg.from;
  const to = D.test(u.get("to") ?? "") ? u.get("to")! : rg.to;
  const r = await buildReport(db, p, key, from, to, dim);
  const period = `${fmtDate(from)} – ${fmtDate(to)}`;
  const name = `${r.title}_${from}_${to}`.replace(/[\s/]+/g, "_");
  if (u.get("format") === "pdf") {
    const f = formatReport(r);
    return fileResponse(await reportPdf(await getSetting(db, "company"), { title: r.title, subtitle: period, ...f }), `${name}.pdf`, PDF, true);
  }
  const buf = await sheetsBuffer([{ name: r.title.slice(0, 31), title: `${r.title} · ${period}`, cols: r.cols.map((c, i) => ({ header: c.title, money: c.money, width: i === 0 ? 40 : 16 })), rows: r.foot ? [...r.rows, r.foot] : r.rows }]);
  return fileResponse(buf, `${name}.xlsx`, XLSX);
});
