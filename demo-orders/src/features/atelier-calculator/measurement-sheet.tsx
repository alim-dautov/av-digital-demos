import type { ReactNode } from "react";
import type { CompanyLogo } from "@/lib/company-apps";
import type { ProposalDocument } from "@/lib/domain/atelier-calc";
import { formatKzt, formatNumberRu } from "@/lib/utils";
import { StyleSummary } from "./style-summary";

export type MeasurementSheetPhoto = {
  id: string;
  url: string;
  name: string;
};

type MeasurementSheetProps = {
  companyName: string;
  companyTagline?: string;
  logo?: CompanyLogo["full"] | null;
  companyPhone?: string | null;
  number?: string | null;
  createdAt?: string | null;
  clientName: string;
  clientPhone: string;
  address: string;
  deadline?: string | null;
  document: ProposalDocument;
  comment?: string | null;
  photos?: MeasurementSheetPhoto[];
  photoActions?: ReactNode;
};

function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Almaty",
  }).format(new Date(iso));
}

export function MeasurementSheet({
  companyName,
  companyTagline,
  logo,
  companyPhone,
  number,
  createdAt,
  clientName,
  clientPhone,
  address,
  deadline,
  document,
  comment,
  photos = [],
  photoActions,
}: MeasurementSheetProps) {
  return (
    <article className="print-area mx-auto w-full max-w-[860px] rounded-xl border border-border bg-white text-neutral-900">
      <header className="flex flex-col gap-6 border-b-2 border-[#B8893B] px-6 pb-6 pt-8 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        {logo ? (
          <img
            src={logo.src}
            width={logo.width}
            height={logo.height}
            alt={companyName}
            className="-my-2 h-auto w-[220px]"
          />
        ) : (
          <div>
            <p className="text-3xl font-semibold tracking-tight">{companyName}</p>
            {companyTagline ? (
              <p className="mt-1 text-sm text-neutral-500">{companyTagline}</p>
            ) : null}
          </div>
        )}
        <div className="sm:text-right">
          <p className="text-sm font-medium text-neutral-500">Лист замера</p>
          {number ? <p className="mt-1 text-xl font-semibold tabular-nums">{number}</p> : null}
          {createdAt ? (
            <p className="mt-1 text-sm text-neutral-500">от {formatLongDate(createdAt)}</p>
          ) : (
            <p className="mt-1 text-sm text-neutral-500">Предпросмотр расчёта</p>
          )}
        </div>
      </header>

      <section className="grid gap-4 px-6 pt-6 sm:grid-cols-2 sm:px-8">
        <div className="rounded-lg bg-neutral-100 p-4">
          <p className="text-sm text-neutral-500">Клиент</p>
          <p className="mt-1 text-lg font-semibold">{clientName || "Клиент не указан"}</p>
          {clientPhone ? (
            <p className="mt-0.5 text-sm tabular-nums text-neutral-600">{clientPhone}</p>
          ) : null}
        </div>
        <div className="rounded-lg bg-neutral-100 p-4">
          <p className="text-sm text-neutral-500">Адрес</p>
          <p className="mt-1 text-lg font-semibold">{address || "Не указан"}</p>
          {deadline ? (
            <p className="mt-0.5 text-sm text-neutral-600">Дедлайн: {deadline}</p>
          ) : null}
        </div>
      </section>

      {comment?.trim() ? (
        <section className="px-6 pt-6 sm:px-8">
          <div className="rounded-lg bg-neutral-100 p-4">
            <p className="text-sm text-neutral-500">Комментарий</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{comment.trim()}</p>
          </div>
        </section>
      ) : null}

      <div className="px-6 pb-2 pt-2 sm:px-8">
        {document.rooms.flatMap((room, ri) =>
          room.sections.map((section) => ({
            ...section,
            title: document.rooms.length > 1 ? `${room.name} · ${section.title}` : section.title,
            key: `${ri}-${section.title}`,
          })),
        ).map((section) => (
          <section key={section.key} className="mt-6">
            <div className="flex items-end justify-between border-b border-neutral-900 pb-1.5">
              <h2 className="text-base font-semibold">{section.title}</h2>
              <p className="text-sm font-medium tabular-nums text-neutral-600">
                {formatKzt(section.subtotal)}
              </p>
            </div>
            <ul>
              {section.rows.map((row, index) => (
                <li
                  key={`${section.key}-${index}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-neutral-200 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_88px_112px]"
                >
                  <p className="font-medium">{row.name}</p>
                  <p className="col-span-2 text-neutral-600 sm:col-span-1">{row.specs || "—"}</p>
                  <p className="hidden text-right tabular-nums text-neutral-600 sm:block">
                    {formatNumberRu(row.qty)} {row.unit}
                  </p>
                  <p className="text-right font-semibold tabular-nums">{formatKzt(row.price)}</p>
                  {row.note ? (
                    <p className="col-span-full text-xs text-neutral-600">Заметка: {row.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="flex justify-end px-6 pt-4 sm:px-8">
        <div className="w-full max-w-sm space-y-1.5 text-sm">
          {document.discountPercent > 0 ? (
            <>
              <div className="flex justify-between">
                <span className="text-neutral-500">Стоимость</span>
                <span className="tabular-nums">{formatKzt(document.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Скидка {document.discountPercent}%</span>
                <span className="tabular-nums">−{formatKzt(document.discountAmount)}</span>
              </div>
            </>
          ) : null}
          <div className="mt-2 flex items-center justify-between rounded-lg bg-neutral-900 px-4 py-3 text-white">
            <span className="text-sm font-medium">Итого</span>
            <span className="text-2xl font-semibold tabular-nums text-[#E4B15A]">
              {formatKzt(document.total)}
            </span>
          </div>
        </div>
      </section>

      <section className="px-6 sm:px-8">
        {document.rooms.map((room) => (
          <div key={room.name} className="mt-4">
            {document.rooms.length > 1 ? <p className="text-sm font-medium">{room.name}</p> : null}
            <StyleSummary ids={room.curtainStyleIds} />
          </div>
        ))}
      </section>

      <section className="px-6 pb-8 pt-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Фото замера</h2>
          {photoActions}
        </div>
        {photos.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Фото пока не прикреплены.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-lg bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.name} className="aspect-square w-full object-cover" />
                <p className="truncate px-2 py-1.5 text-xs text-neutral-600">{photo.name}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-neutral-200 px-6 py-4 text-xs text-neutral-500 sm:px-8">
        <span className="font-medium text-neutral-700">{companyName}</span>
        {companyPhone ? <span>Тел.: {companyPhone}</span> : null}
      </footer>
    </article>
  );
}
