import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { listActivity } from "@/lib/services/activity";
import { getClient } from "@/lib/services/clients";
import { syncClientCardPhotos } from "@/lib/services/client-photos";
import { listClientMeasurements } from "@/lib/services/client-measurements";
import { formatDateRu, formatKzt, formatTimeRu } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS,
  ATELIER_ORDER_STATUS_LABELS,
  SOURCE_LABELS,
} from "@/types";
import { ClientCalcActions } from "@/features/clients/client-calc-actions";
import { FilesAndNotes } from "@/features/shared/files-and-notes";
import type { AnyOrderStatus } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { cn } from "@/lib/utils";

function Field({
  label,
  children,
  numeric,
  className,
}: {
  label: string;
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", numeric && "tabular-nums")}>{children}</dd>
    </div>
  );
}

function NotSet({ text = "Не указан" }: { text?: string }) {
  return <span className="font-normal text-muted-foreground">{text}</span>;
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("clients");

  const { id } = await params;
  const textiles = isTextilesCompany(session.companyId);
  if (textiles) syncClientCardPhotos(session.companyId, id);
  const client = getClient(session.companyId, id);
  if (!client) notFound();

  const activity = listActivity(session.companyId, 100).filter(
    (a) => a.entityType === "client" && a.entityId === client.id,
  );
  const measurements = textiles ? listClientMeasurements(session.companyId, client.id) : [];
  const canWrite = can(session, "clients", "write");
  const canCreateOrder = can(session, "orders", "write");
  const canSendWorkshop =
    can(session, "orders", "write") || can(session, "calculator", "write");

  function statusLabel(status: AnyOrderStatus) {
    if (textiles && status in ATELIER_ORDER_STATUS_LABELS) {
      return ATELIER_ORDER_STATUS_LABELS[
        status as keyof typeof ATELIER_ORDER_STATUS_LABELS
      ];
    }
    return (
      ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/clients">
            <ArrowLeft className="size-4" />
            К клиентам
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {client.fullName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Источник: {SOURCE_LABELS[client.source]}
        </p>
        {textiles && (
          <div className="mt-3 flex flex-wrap gap-2">
            {can(session, "proposals", "read") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proposals?q=${encodeURIComponent(client.phone || client.fullName)}`}>
                  КП клиента
                </Link>
              </Button>
            )}
            {can(session, "gallery", "read") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/gallery?client=${client.id}`}>Фото клиента</Link>
              </Button>
            )}
            {can(session, "calendar", "read") && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/calendar">Календарь замеров</Link>
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Карточка</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Телефон" numeric>
                <a href={`tel:${client.phone}`} className="hover:text-primary">
                  {client.phone}
                </a>
              </Field>
              <Field label="WhatsApp" numeric>
                {client.whatsapp ?? <NotSet />}
              </Field>
              <Field label="Email" className="col-span-2 sm:col-span-1">
                {client.email ? (
                  <a href={`mailto:${client.email}`} className="break-all hover:text-primary">
                    {client.email}
                  </a>
                ) : (
                  <NotSet />
                )}
              </Field>
              <Field label="Первый контакт" numeric>
                {formatDateRu(client.firstContactAt)}
              </Field>
              <Field label="Последний заказ" numeric>
                {client.lastOrderAt ? formatDateRu(client.lastOrderAt) : <NotSet text="Заказов нет" />}
              </Field>
              <Field label="Заказов" numeric>
                {client.ordersCount}
              </Field>
              <Field label="Сумма" numeric>
                {formatKzt(client.totalAmount)}
              </Field>
              {client.address ? (
                <Field label="Адрес" className="col-span-2">
                  <span className="font-normal">{client.address}</span>
                </Field>
              ) : null}
              {client.comment && (
                <Field label="Комментарий" className="col-span-2">
                  <span className="font-normal">{client.comment}</span>
                </Field>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Лента активности</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState compact title="Событий пока нет" />
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="border-l-2 border-primary/40 pl-3 text-sm"
                  >
                    <p>{a.action}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {a.actorName}, {formatDateRu(a.createdAt)} в{" "}
                      {formatTimeRu(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{textiles ? "Расчёты" : "История заказов"}</CardTitle>
          {textiles ? (
            <p className="text-sm text-muted-foreground">
              Сохранённые расчёты. Отсюда можно открыть лист замера или отправить заказ в цех.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {client.orders.length === 0 ? (
            <EmptyState
              compact
              title={textiles ? "Расчётов пока нет" : "Заказов пока нет"}
              description={textiles ? "Нажмите «Сохранить» в калькуляторе — расчёт появится здесь." : undefined}
              action={
                textiles
                  ? can(session, "calculator", "write")
                    ? { label: "Открыть калькулятор", href: "/calculator" }
                    : undefined
                  : canCreateOrder
                    ? { label: "Создать заказ", href: "/orders?new=1" }
                    : undefined
              }
            />
          ) : (
            <>
              <MobileList inset aria-label={textiles ? "Расчёты клиента" : "История заказов"}>
                {client.orders.map((o) => (
                  <MobileListItem
                    key={o.id}
                    href={textiles && o.atelierQuote ? `/calculator?order=${o.id}` : `/orders/${o.number}`}
                    title={`№${o.number}`}
                    subtitle={o.atelierQuote?.orderComment?.trim() || o.description}
                    meta={formatDateRu(o.date)}
                    value={formatKzt(o.amount)}
                    valueMeta={<Badge variant="outline">{statusLabel(o.status)}</Badge>}
                    actions={
                      textiles && o.atelierQuote ? (
                        <ClientCalcActions
                          orderId={o.id}
                          orderNumber={o.number}
                          sent={Boolean(o.sewingOrderAt)}
                          canSend={canSendWorkshop}
                          quote={o.atelierQuote}
                          sewingRoomIds={o.sewingRoomIds}
                        />
                      ) : null
                    }
                  />
                ))}
              </MobileList>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    {textiles ? <TableHead>Действия</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link
                          href={textiles && o.atelierQuote ? `/calculator?order=${o.id}` : `/orders/${o.number}`}
                          className="font-medium tabular-nums text-primary hover:underline"
                        >
                          №{o.number}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDateRu(o.date)}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        {o.atelierQuote?.orderComment?.trim() || o.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{statusLabel(o.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKzt(o.amount)}
                      </TableCell>
                      {textiles ? (
                        <TableCell>
                          {o.atelierQuote ? (
                            <ClientCalcActions
                              orderId={o.id}
                              orderNumber={o.number}
                              sent={Boolean(o.sewingOrderAt)}
                              canSend={canSendWorkshop}
                              quote={o.atelierQuote}
                              sewingRoomIds={o.sewingRoomIds}
                            />
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {textiles && (
        <Card>
          <CardHeader>
            <CardTitle>Замеры</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {measurements.length === 0 ? (
              <EmptyState compact title="Замеров пока нет" description="Черновик из калькулятора появится здесь." />
            ) : (
              <MobileList inset aria-label="Замеры">
                {measurements.map((measurement) => (
                  <MobileListItem
                    key={measurement.id}
                    href={`/measurements/${measurement.id}`}
                    title={measurement.number}
                    subtitle={measurement.address || measurement.quote.clientName}
                    meta={formatDateRu(measurement.updatedAt)}
                    value={formatKzt(measurement.quote.total)}
                    valueMeta={
                      <Badge variant="outline">
                        {measurement.kind === "draft" ? "Черновик" : "Лист замера"}
                      </Badge>
                    }
                  />
                ))}
              </MobileList>
            )}
          </CardContent>
        </Card>
      )}

      {textiles && (
        <Card>
          <CardHeader>
            <CardTitle>Фото и заметки</CardTitle>
          </CardHeader>
          <CardContent>
            <FilesAndNotes
              entityType="client"
              entityId={client.id}
              photos={client.photos ?? []}
              notes={client.notes ?? []}
              canWrite={canWrite}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
