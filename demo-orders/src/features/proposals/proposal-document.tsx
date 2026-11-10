import type { CompanyLogo } from "@/lib/company-apps";
import type { ProposalDocument, ProposalDocRoom } from "@/lib/domain/atelier-calc";
import { StyleSummary } from "@/features/atelier-calculator/style-summary";
import { formatKzt, formatNumberRu } from "@/lib/utils";

export type ProposalView = {
  number: string;
  createdAt: string;
  orderNumber: string | null;
  companyName: string;
  companyTagline: string;
  logo?: CompanyLogo["full"] | null;
  companyContacts: { phone?: string; email?: string; address?: string };
  clientName: string;
  clientPhone: string;
  address: string;
  document: ProposalDocument | null;
  items: { name: string; qty: number; specs: string; price: number }[];
  total: number;
  terms: string;
  deadlineDays: number;
  accent: string;
  photos?: { id: string; url: string; name: string }[];
};

function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

function daysWord(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "день";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "дня";
  return "дней";
}

function PriceBlock({
  accent,
  rooms,
  subtotal,
  discountPercent,
  discountAmount,
  total,
}: {
  accent: string;
  rooms?: ProposalDocRoom[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
}) {
  const discounted = discountPercent > 0;
  return (
    <section className="mx-8 mt-8 overflow-hidden rounded-2xl border border-neutral-200 break-inside-avoid">
      {rooms && rooms.length > 0 ? (
        <div className="divide-y divide-neutral-200 bg-neutral-50">
          {rooms.map((room, index) => (
            <div key={`${room.name}-${index}`} className="px-5 py-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-semibold">{room.name}</p>
                <p className="font-semibold tabular-nums">{formatKzt(room.subtotal)}</p>
              </div>
              <ul className="mt-1.5 space-y-1">
                {room.sections.map((section) => (
                  <li key={section.title} className="flex justify-between gap-4 text-sm text-neutral-600">
                    <span>{section.title}</span>
                    <span className="tabular-nums">{formatKzt(section.subtotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {discounted ? (
        <div className="space-y-1.5 px-5 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Стоимость</span>
            <span className="tabular-nums">{formatKzt(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Скидка {discountPercent}%</span>
            <span className="tabular-nums">−{formatKzt(discountAmount)}</span>
          </div>
        </div>
      ) : null}
      <div className="flex items-end justify-between gap-4 bg-neutral-950 px-5 py-5 text-white">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/65">Итого к оплате</p>
          <p className="mt-1 text-sm text-white/75">
            {discounted ? `Со скидкой ${discountPercent}%` : "Без скидки"}
          </p>
        </div>
        <p className="text-3xl font-semibold tabular-nums" style={{ color: accent }}>
          {formatKzt(total)}
        </p>
      </div>
    </section>
  );
}

export function ProposalDocumentView({ data }: { data: ProposalView }) {
  const doc = data.document;
  const positions = doc
    ? doc.rooms.reduce((n, room) => n + room.sections.reduce((s, x) => s + x.rows.length, 0), 0)
    : data.items.length;

  return (
    <article
      className="print-area mx-auto w-full max-w-[860px] rounded-xl border border-border bg-white text-neutral-900 shadow-sm"
    >
      <header className="flex flex-col gap-6 border-b-2 px-8 pb-6 pt-8 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: data.accent }}>
        {data.logo ? (
          <img
            src={data.logo.src}
            width={data.logo.width}
            height={data.logo.height}
            alt={data.companyName}
            className="-my-2 h-auto w-[220px]"
          />
        ) : (
          <div>
            <p className="text-3xl font-semibold tracking-tight">{data.companyName}</p>
            {data.companyTagline ? <p className="mt-1 text-sm text-neutral-500">{data.companyTagline}</p> : null}
          </div>
        )}
        <div className="sm:text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Коммерческое предложение</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{data.number}</p>
          <p className="mt-1 text-sm text-neutral-500">от {formatLongDate(data.createdAt)}</p>
          {data.orderNumber ? <p className="text-sm text-neutral-500">Заказ {data.orderNumber}</p> : null}
        </div>
      </header>

      <section className="grid gap-4 px-8 pt-6 sm:grid-cols-2">
        <div className="rounded-lg bg-neutral-100 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Клиент</p>
          <p className="mt-1 text-lg font-semibold">{data.clientName || "Клиент не указан"}</p>
          {data.clientPhone ? <p className="mt-0.5 text-sm tabular-nums text-neutral-600">{data.clientPhone}</p> : null}
        </div>
        <div className="rounded-lg bg-neutral-100 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Адрес объекта</p>
          <p className="mt-1 text-lg font-semibold">{data.address || "Не указан"}</p>
          <p className="mt-0.5 text-sm text-neutral-600">{positions} поз.</p>
          {doc?.measurementDate ? (
            <p className="mt-0.5 text-sm text-neutral-600">
              Дата замера: {formatLongDate(doc.measurementDate)}
            </p>
          ) : null}
        </div>
      </section>

      <div className="px-8 pb-2 pt-4">
        {doc ? (
          doc.rooms.map((room, ri) => (
            <div key={`room-${ri}`} className="mt-8 first:mt-4">
              <div
                className="flex items-end justify-between border-b-2 pb-2"
                style={{ borderColor: data.accent }}
              >
                <h2 className="text-xl font-semibold tracking-tight">{room.name}</h2>
                <p className="text-lg font-semibold tabular-nums">{formatKzt(room.subtotal)}</p>
              </div>
              <StyleSummary ids={room.curtainStyleIds} />
              <p className="mt-1.5 text-xs text-neutral-500">
                Материалы {formatKzt(room.breakdown.materials)} · пошив{" "}
                {formatKzt(room.breakdown.sewing)} · доп. элементы {formatKzt(room.breakdown.extras)}
              </p>
              {room.sections.map((section) => (
                <section key={`${ri}-${section.title}`} className="mt-5 break-inside-avoid-page">
                  <div className="flex items-end justify-between border-b border-neutral-900 pb-1.5">
                    <h3 className="text-base font-semibold">{section.title}</h3>
                    <p className="text-sm font-medium tabular-nums text-neutral-600">{formatKzt(section.subtotal)}</p>
                  </div>
                  <ul>
                    {section.rows.map((r, i) => (
                      <li
                        key={`${ri}-${section.title}-${i}`}
                        className="flex items-start justify-between gap-6 border-b border-neutral-200 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{r.name}</p>
                          {r.specs ? <p className="mt-0.5 text-neutral-600">{r.specs}</p> : null}
                        </div>
                        <p className="shrink-0 text-right font-semibold tabular-nums">{formatKzt(r.price)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))
        ) : (
          <ul className="mt-6">
            {data.items.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="grid grid-cols-[1fr_auto] gap-x-6 border-b border-neutral-200 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_70px_120px]"
              >
                <p className="font-medium">{item.name}</p>
                <p className="order-3 col-span-2 text-neutral-600 sm:order-none sm:col-span-1">{item.specs || "—"}</p>
                <p className="hidden text-right tabular-nums text-neutral-600 sm:block">{formatNumberRu(item.qty)}</p>
                <p className="text-right font-semibold tabular-nums">{formatKzt(item.price)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PriceBlock
        accent={data.accent}
        rooms={doc?.rooms}
        subtotal={doc?.subtotal ?? data.total}
        discountPercent={doc?.discountPercent ?? 0}
        discountAmount={doc?.discountAmount ?? 0}
        total={data.total}
      />

      {data.photos && data.photos.length > 0 ? (
        <section className="px-8 pb-2 pt-6 break-inside-avoid">
          <h2 className="text-base font-semibold">Фото</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.photos.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-lg bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.name} className="aspect-square w-full object-cover" />
                <p className="truncate px-2 py-1.5 text-xs text-neutral-600">{photo.name}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 px-8 pb-8 pt-8 text-sm sm:grid-cols-2 break-inside-avoid">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Условия</p>
          <p className="mt-1 leading-relaxed text-neutral-700">{data.terms}</p>
        </div>
        <div className="border-l-[3px] bg-neutral-100 p-3" style={{ borderColor: data.accent }}>
          <p className="font-semibold">
            Срок изготовления: {data.deadlineDays} {daysWord(data.deadlineDays)}
          </p>
          <p className="mt-1 text-neutral-600">Срок уточняется после замера.</p>
        </div>
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-neutral-200 px-8 py-4 text-xs text-neutral-500">
        <span className="font-medium text-neutral-700">{data.companyName}</span>
        {data.companyContacts.phone ? <span>Тел.: {data.companyContacts.phone}</span> : null}
        {data.companyContacts.email ? <span>{data.companyContacts.email}</span> : null}
        {data.companyContacts.address ? <span>{data.companyContacts.address}</span> : null}
      </footer>
    </article>
  );
}
