import { redirect } from "next/navigation";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getData } from "@/lib/db";
import { listClients } from "@/lib/services/clients";
import {
  getWorkWindow,
  listMeasurements,
  listMeasurers,
  measurerLoad,
} from "@/lib/services/measurements";
import { todayDate } from "@/lib/utils";
import { CalendarView } from "./calendar-view";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) return null;
  if (!can(session, "calendar", "read")) redirect("/");

  const params = await searchParams;
  const rawDate = typeof params.date === "string" ? params.date : "";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDate();
  const view = params.view === "day" ? "day" : "week";

  const weekStart = startOfWeek(parseISO(anchor), { weekStartsOn: 1 });
  const dates =
    view === "day"
      ? [anchor]
      : Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));

  const companyId = session.companyId;
  const measurers = listMeasurers(companyId).map((e) => ({
    id: e.id,
    fullName: e.fullName,
    phone: e.phone,
  }));
  const measurements = listMeasurements(companyId, {
    from: dates[0],
    to: dates[dates.length - 1],
  });
  const clients = listClients(companyId).map((c) => ({
    id: c.id,
    fullName: c.fullName,
    phone: c.phone,
    address: c.address ?? "",
  }));
  const orders = getData()
    .orders.filter((o) => o.companyId === companyId && isActiveOrder(o) && o.status !== "cancelled")
    .map((o) => ({
      id: o.id,
      number: o.number,
      clientId: o.clientId,
      address: o.address ?? "",
    }));

  return (
    <CalendarView
      view={view}
      anchor={anchor}
      today={todayDate()}
      dates={dates}
      measurers={measurers}
      measurements={measurements}
      clients={clients}
      orders={orders}
      load={measurerLoad(companyId, dates)}
      workWindow={getWorkWindow(companyId)}
      canWrite={can(session, "calendar", "write")}
    />
  );
}
