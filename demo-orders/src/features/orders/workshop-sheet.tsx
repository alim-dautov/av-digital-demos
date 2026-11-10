import { MessageSquareText } from "lucide-react";
import { StyleSummary } from "@/features/atelier-calculator/style-summary";
import { CoverSketch, PillowSketch } from "@/features/atelier-calculator/technical-sketch";
import type { WorkshopDocument } from "@/lib/domain/atelier-workshop";
import { formatMeters } from "@/lib/utils";

function ruDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-2 flex gap-2 rounded-md border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-neutral-900 print:break-inside-avoid">
      <MessageSquareText className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <p className="whitespace-pre-wrap">
        <span className="font-semibold">{title}: </span>
        {text}
      </p>
    </div>
  );
}

export function WorkshopSheet({
  companyName,
  number,
  clientName,
  document,
  deadline,
  orderNote,
}: {
  companyName: string;
  number: string;
  clientName: string;
  document: WorkshopDocument;
  /** Order deadline, overrides the quote's one */
  deadline?: string;
  /** Comment saved on the order card, if it differs from the calculator comment */
  orderNote?: string | null;
}) {
  const due = ruDate(deadline || document.deadline);
  const facts: [string, string][] = [
    ["Клиент", clientName || document.clientName],
    ["Телефон", document.clientPhone],
    ["Адрес", document.address],
    ["Дата замера", ruDate(document.measurementDate)],
    ["Срок сдачи", due],
  ];
  const extraNote = orderNote?.trim() && orderNote.trim() !== document.orderComment ? orderNote.trim() : "";

  return (
    <article className="print-area mx-auto w-full max-w-[860px] rounded-xl border border-border bg-white px-6 py-8 text-neutral-900 sm:px-8">
      <header className="border-b-2 border-[#B8893B] pb-4">
        <p className="text-sm text-neutral-500">{companyName}</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">Заказ в цех на пошив</h1>
          <p className="text-xl font-bold tabular-nums">№{number}</p>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-neutral-500">{k}:</dt>
                <dd className={k === "Срок сдачи" ? "font-semibold text-red-700" : "font-medium"}>{v}</dd>
              </div>
            ))}
        </dl>
      </header>

      {document.orderComment ? <Note title="Комментарий к заказу" text={document.orderComment} /> : null}
      {extraNote ? <Note title="Заметка к заказу" text={extraNote} /> : null}

      {document.fabricTotals.length > 0 && (
        <section className="mt-5 rounded-lg border border-neutral-200 p-4 print:break-inside-avoid">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Итого ткани по заказу (погонные метры)
          </h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {document.fabricTotals.map((t) => (
                <tr key={`${t.kind}-${t.fabricName}`} className="border-t border-neutral-100">
                  <td className="py-1 pr-2 text-neutral-500">{t.kind}</td>
                  <td className="py-1 pr-2 font-medium">{t.fabricName}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{formatMeters(t.meters, "п.м.")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-6 space-y-8">
        {document.rooms.map((room, roomIndex) => (
          <section key={`${room.name}-${roomIndex}`} className="space-y-3">
            <h2 className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-neutral-900 px-3 py-2 text-lg font-semibold text-white print:bg-neutral-200 print:text-neutral-900">
              <span>{room.name}</span>
              {room.fabricMeters > 0 && (
                <span className="text-sm font-normal tabular-nums">
                  ткань всего {formatMeters(room.fabricMeters, "п.м.")}
                </span>
              )}
            </h2>
            <StyleSummary ids={room.curtainStyleIds} />
            <ul className="grid gap-3 sm:grid-cols-2">
              {room.lines.map((line, i) => (
                <li
                  key={`${line.title}-${i}`}
                  className="rounded-lg border border-neutral-300 p-3 print:break-inside-avoid"
                >
                  <p className="text-base font-semibold">{line.title}</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-neutral-800">
                    {line.details.map((detail, j) => (
                      <li key={`${detail}-${j}`}>{detail}</li>
                    ))}
                  </ul>
                  {line.note ? <Note title="Комментарий" text={line.note} /> : null}
                </li>
              ))}
            </ul>
            {(room.pillows.length > 0 || room.covers.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {room.pillows.map((pillow, index) => (
                  <div key={`pillow-${index}`} className="print:break-inside-avoid">
                    <p className="mb-1 text-sm font-medium">Подушка №{index + 1}</p>
                    <PillowSketch width={pillow.width} length={pillow.length} />
                  </div>
                ))}
                {room.covers.map((cover, index) => (
                  <div key={`cover-${index}`} className="print:break-inside-avoid">
                    <p className="mb-1 text-sm font-medium">Покрывало №{index + 1}</p>
                    <CoverSketch width={cover.width} length={cover.length} overhang={cover.overhang} />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
