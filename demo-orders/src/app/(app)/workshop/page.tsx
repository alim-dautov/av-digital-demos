import { redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/auth";
import { isTextilesCompany } from "@/lib/company";
import { getData } from "@/lib/db";
import { normalizeAtelierQuote } from "@/lib/domain/atelier-calc";
import { can } from "@/lib/rbac";
import { listWorkshopOrders, workshopRooms } from "@/lib/services/workshop";
import { WorkshopView, type WorkshopOrderDetail } from "@/features/workshop/workshop-view";
import type { AtelierOrderStatus } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import { listOrderAudit } from "@/lib/services/production-order";

function orderDetail(companyId: string, key: string, canViewAudit: boolean): WorkshopOrderDetail | null {
  const data = getData();
  const order = data.orders.find(
    (o) =>
      o.companyId === companyId &&
      isActiveOrder(o) &&
      (o.id === key || o.number === key) &&
      ["awaiting", "in_work", "completed", "cancelled"].includes(o.status),
  );
  if (!order) return null;
  const quote = order.atelierQuote ? normalizeAtelierQuote(order.atelierQuote) : null;
  const client = data.clients.find((c) => c.id === order.clientId);
  return {
    id: order.id,
    updatedAt: order.updatedAt,
    number: order.number,
    status: order.status as AtelierOrderStatus,
    clientName: client?.fullName ?? quote?.clientName ?? "Клиент",
    address: order.address ?? quote?.address ?? null,
    deadline: order.deadline,
    comment: order.comment,
    acceptedBy: order.acceptedBy ?? null,
    acceptedAt: order.acceptedAt ?? null,
    statusHistory: order.statusHistory ?? [],
    audit: canViewAudit ? listOrderAudit(companyId, order.id) : [],
    photos: order.media.filter((m) => m.type === "photo"),
    rooms: workshopRooms({ atelierQuote: quote, sewingRoomIds: order.sewingRoomIds }).map((r) => ({
      id: r.id,
      name: r.name.trim() || "Без названия",
      fabrics: [
        ...r.tulle.map((l) => ({ ...l, kind: "Тюль" })),
        ...r.portiere.map((l) => ({ ...l, kind: "Портьера" })),
      ].map((l) => ({
        id: l.id,
        kind: l.kind,
        fabricName: l.fabricName,
        width: l.width,
        height: l.height,
        meterage: l.meterage,
        metersNeeded: l.metersNeeded,
        coeff: l.coeffEnabled ? l.assemblyCoeff : null,
        sewingMeters: l.sewing.meters,
        tape: l.tape.enabled ? l.tape.meters : null,
        extras: [
          ...l.extras.map((e) => `${e.name} × ${e.quantity} ${e.unit}`),
          ...(l.heightFrom?.trim() ? [`высота от: ${l.heightFrom.trim()}`] : []),
          ...(l.cut?.trim() || l.cutNote?.trim()
            ? [`разрез: ${[l.cut?.trim(), l.cutNote?.trim()].filter(Boolean).join(", ")}`]
            : []),
        ],
        note: l.note?.trim() || null,
      })),
      covers: r.covers.map((c) => ({
        id: c.id,
        text: `${c.width}×${c.length} м, свес ${c.overhang} м`,
        production: {
          collection: "covers" as const,
          fields: [
            { key: "width", label: "Ширина, м", value: c.width },
            { key: "length", label: "Длина, м", value: c.length },
            { key: "overhang", label: "Свес, м", value: c.overhang },
          ],
        },
      })),
      pillows: r.pillows.map((p) => ({
        id: p.id,
        text: `${p.width}×${p.height} м × ${p.quantity} шт.${p.note ? `, ${p.note}` : ""}`,
        production: {
          collection: "pillows" as const,
          fields: [
            { key: "width", label: "Ширина, м", value: p.width },
            { key: "height", label: "Высота, м", value: p.height },
            { key: "quantity", label: "Количество", value: p.quantity },
          ],
        },
      })),
      cornices: r.cornices.map((c) => ({
        id: c.id,
        text: `${c.label}, ${c.meters} м`,
        production: { collection: "cornices" as const, fields: [{ key: "meters", label: "Метраж, м", value: c.meters }] },
      })),
      rollers: r.rollers.map((x) => ({
        id: x.id,
        text: `${x.width}×${x.height} м`,
        production: {
          collection: "rollers" as const,
          fields: [
            { key: "width", label: "Ширина, м", value: x.width },
            { key: "height", label: "Высота, м", value: x.height },
          ],
        },
      })),
    })),
  };
}

export default async function WorkshopPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await requirePageAccess("workshop");
  if (!isTextilesCompany(session.companyId)) redirect("/");
  const { order } = await searchParams;

  return (
    <WorkshopView
      orders={listWorkshopOrders(session.companyId)}
    selected={order ? orderDetail(session.companyId, order, session.role === "OWNER" || session.role === "DIRECTOR") : null}
      currentUserId={session.id}
      canAccept={can(session, "workshop", "write")}
      canManage={can(session, "orders", "write")}
      canEditProduction={can(session, "workshop", "write")}
      canViewAudit={session.role === "OWNER" || session.role === "DIRECTOR"}
      draftScope={`${session.companyId}:${session.id}`}
      canOpenSheet={can(session, "orders", "read")}
    />
  );
}
