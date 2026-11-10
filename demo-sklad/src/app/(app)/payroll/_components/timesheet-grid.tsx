"use client";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/components/ui";
import { setTimesheetAction } from "@/modules/payroll/actions";

type St = "present" | "absent" | "vacation" | "sick" | "dayoff";
const ORDER: (St | "clear")[] = ["present", "dayoff", "absent", "sick", "vacation", "clear"];
const VIEW: Record<St, { s: string; cls: string; label: string }> = {
  present: { s: "Я", cls: "bg-success-bg text-success", label: "явка" },
  dayoff: { s: "В", cls: "bg-surface-2 text-ink-3", label: "выходной" },
  absent: { s: "Н", cls: "bg-danger-bg text-danger", label: "неявка" },
  sick: { s: "Б", cls: "bg-warning-bg text-warning", label: "больничный" },
  vacation: { s: "О", cls: "bg-info-bg text-info", label: "отпуск" },
};

export function TimesheetGrid({ days, people, rows, editable, closed }: {
  days: string[]; people: { id: number; name: string }[]; rows: { userId: number; date: string; status: string; hours: number }[]; editable: boolean; closed: boolean;
}) {
  const [map, setMap] = useState(() => new Map(rows.map((r) => [`${r.userId}:${r.date}`, { status: r.status as St, hours: Number(r.hours) }])));
  const cycle = async (userId: number, date: string) => {
    if (!editable || closed) return;
    const k = `${userId}:${date}`;
    const cur = map.get(k)?.status;
    const next = ORDER[(cur ? ORDER.indexOf(cur) + 1 : 0) % ORDER.length];
    const prev = new Map(map);
    const m = new Map(map);
    if (next === "clear") m.delete(k); else m.set(k, { status: next, hours: next === "present" ? 8 : 0 });
    setMap(m);
    const r = await setTimesheetAction({ userId, date, status: next, hours: next === "present" ? 8 : 0 });
    if (!r.ok) { setMap(prev); toast.error(r.error); }
  };
  const wd = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-xs">{(Object.keys(VIEW) as St[]).map((s) => <span key={s} className="flex items-center gap-1.5"><span className={cn("grid size-6 place-items-center rounded-md font-bold", VIEW[s].cls)}>{VIEW[s].s}</span>{VIEW[s].label}</span>)}</div>
      <div className="scroll-thin overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="text-xs">
          <thead><tr>
            <th className="sticky left-0 z-10 min-w-36 bg-surface px-3 py-2 text-left">Сотрудник</th>
            {days.map((d) => <th key={d} className={cn("w-9 px-0.5 py-2 text-center font-semibold", (wd(d) === 0 || wd(d) === 6) && "text-danger/70")}>{Number(d.slice(8))}</th>)}
            <th className="px-3 py-2 text-right">Дней</th><th className="px-3 py-2 text-right">Часов</th>
          </tr></thead>
          <tbody>
            {people.map((p) => {
              let dd = 0, hh = 0;
              for (const d of days) { const v = map.get(`${p.id}:${d}`); if (v?.status === "present") { dd++; hh += v.hours; } }
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="sticky left-0 z-10 truncate bg-surface px-3 py-1.5 font-semibold">{p.name}</td>
                  {days.map((d) => {
                    const v = map.get(`${p.id}:${d}`);
                    return (
                      <td key={d} className="p-0.5">
                        <button type="button" disabled={!editable || closed} onClick={() => cycle(p.id, d)} title={`${p.name}, ${d}: ${v ? VIEW[v.status].label : "не отмечено"}`}
                          className={cn("grid size-8 place-items-center rounded-md font-bold transition-colors duration-150", v ? VIEW[v.status].cls : "bg-transparent text-ink-3/40 hover:bg-surface-2", editable && !closed && "cursor-pointer")}>
                          {v ? VIEW[v.status].s : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="tnum px-3 text-right font-semibold">{dd}</td><td className="tnum px-3 text-right">{hh}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && !closed && <p className="text-xs text-ink-3">Нажмите на ячейку, чтобы сменить отметку: явка → выходной → неявка → больничный → отпуск → пусто</p>}
    </div>
  );
}
