import { getData, mutateData } from "@/lib/db";
import { isTextilesCompany } from "@/lib/company";
import {
  atelierQuoteToProposalItems,
  recalculateAtelierQuote,
  selectQuoteRooms,
} from "@/lib/domain/atelier-calc";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import { copyPhotosOntoClient } from "@/lib/services/client-photos";
import { getAtelierLabels } from "@/lib/services/atelier-labels";
import { syncExpensesInData } from "@/lib/services/order-expenses";
import type {
  CommercialProposal,
  EntityNote,
  LeadSource,
  MediaItem,
  Order,
  AtelierOrderStatus,
  AtelierQuoteSnapshot,
} from "@/types";
import { ATELIER_ORDER_STATUS_LABELS, SOURCE_LABELS } from "@/types";

const ATELIER_STATUSES = Object.keys(
  ATELIER_ORDER_STATUS_LABELS,
) as AtelierOrderStatus[];

export function isAtelierStatus(status: string): status is AtelierOrderStatus {
  return ATELIER_STATUSES.includes(status as AtelierOrderStatus);
}

export function nextAtelierOrderNumber(companyId: string): string {
  const year = new Date().getFullYear();
  const prefix = `ZP-${year}-`;
  const nums = getData()
    .orders.filter(
      (o) => o.companyId === companyId && o.number.startsWith(prefix),
    )
    .map((o) => Number(o.number.slice(prefix.length)))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function resolveLeadSource(source: LeadSource | null | undefined): LeadSource {
  if (source && source in SOURCE_LABELS) return source;
  return "other";
}

export type AtelierActor = { id: string; name: string };

/** Saves the quote on a new or existing order. Status changes go through the workshop service. */
export function saveAtelierDraft(
  companyId: string,
  input: {
    orderId?: string | null;
    quote: AtelierQuoteSnapshot;
  },
  actor: AtelierActor,
): Order {
  if (!isTextilesCompany(companyId)) {
    throw new Error("Доступно только для Шторы Демо");
  }

  const quote = recalculateAtelierQuote({
    ...input.quote,
    labels: getAtelierLabels(companyId),
  });
  let result!: Order;

  const leadSource = resolveLeadSource(quote.leadSource);
  mutateData((data) => {
    let clientId = quote.clientId;
    const named = quote.clientName.trim();
    const phone = quote.clientPhone.trim();
    let client = clientId
      ? data.clients.find((c) => c.id === clientId && c.companyId === companyId)
      : undefined;
    if (!client && (named || phone)) {
      client = data.clients.find(
        (c) =>
          c.companyId === companyId &&
          ((phone && c.phone === phone) ||
            (named && c.fullName.toLowerCase() === named.toLowerCase())),
      );
    }
    if (!client && (named || phone)) {
      clientId = generateId("cli");
      client = {
        id: clientId,
        companyId,
        fullName: named || "Клиент",
        phone,
        whatsapp: phone || null,
        email: null,
        source: leadSource,
        sourceNote: quote.leadSourceNote?.trim() || null,
        firstContactAt: todayDate(),
        comment: null,
        ordersCount: 0,
        totalAmount: 0,
        lastOrderAt: null,
        address: quote.address || null,
        photos: [],
        notes: [],
      };
      data.clients.push(client);
    }
    if (!client) throw new Error("Укажите имя или телефон клиента");

    clientId = client.id;
    client.address = quote.address || client.address;
    if (phone) client.phone = phone;
    if (named) client.fullName = named;
    if (quote.leadSource) {
      client.source = leadSource;
      client.sourceNote = quote.leadSource === "other" ? quote.leadSourceNote?.trim() || null : null;
    }

    quote.clientId = clientId;
    quote.clientName = client.fullName;

    if (input.orderId) {
      const order = data.orders.find(
        (o) => o.id === input.orderId && o.companyId === companyId && isActiveOrder(o),
      );
      if (!order) throw new Error("Заказ не найден");
      order.clientId = clientId;
      order.source = quote.leadSource ? leadSource : order.source;
      order.sourceNote =
        (quote.leadSource ? quote.leadSource : order.source) === "other"
          ? quote.leadSourceNote?.trim() || order.sourceNote || null
          : null;
      order.comment = quote.orderComment ?? order.comment;
      order.amount = quote.total;
      order.cost = quote.totalCost;
      order.profit = quote.grossProfit;
      order.deadline = quote.deadline || order.deadline;
      order.address = quote.address || order.address;
      order.description =
        order.description ||
        `Заказ ${order.number} — шторы/текстиль`;
      order.atelierQuote = quote;
      order.updatedAt = nowIso();
      order.responsibleId = order.responsibleId ?? actor.id;
      copyPhotosOntoClient(data, companyId, clientId, order.media);
      syncExpensesInData(data, order, actor.id);
      result = { ...order };
      return;
    }

    const number = nextAtelierOrderNumber(companyId);
    const order: Order = {
      id: generateId("ord"),
      companyId,
      number,
      clientId,
      source: leadSource,
      sourceNote: leadSource === "other" ? quote.leadSourceNote?.trim() || null : null,
      status: "draft",
      prepayment: 0,
      payments: [],
      amount: quote.total,
      cost: quote.totalCost,
      profit: quote.grossProfit,
      date: todayDate(),
      deadline: quote.deadline || daysFromNow(14),
      responsibleId: actor.id,
      masterId: null,
      description: `Калькуляция ${number}`,
      comment: quote.orderComment?.trim() ? quote.orderComment.trim() : null,
      furnitureUnits: 0,
      materialsNote: null,
      hardwareNote: null,
      media: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      atelierQuote: quote,
      orderNotes: [],
      address: quote.address || null,
      statusHistory: [
        { status: "draft", from: null, at: nowIso(), actorId: actor.id, actorName: actor.name },
      ],
      acceptedBy: null,
      acceptedAt: null,
      sewingOrderAt: null,
    };
    data.orders.push(order);
    syncExpensesInData(data, order, actor.id);
    client.ordersCount += 1;
    client.totalAmount += quote.total;
    client.lastOrderAt = todayDate();

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Создал заказ ${number}`,
      entityType: "order",
      entityId: order.id,
      createdAt: nowIso(),
    });

    result = { ...order };
  });

  return result;
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function createAtelierProposal(
  companyId: string,
  orderId: string,
  actor: AtelierActor,
  roomIds?: string[] | null,
): CommercialProposal {
  let proposal!: CommercialProposal;
  mutateData((data) => {
    const order = data.orders.find(
      (o) => o.id === orderId && o.companyId === companyId && isActiveOrder(o),
    );
    if (!order || !order.atelierQuote) {
      throw new Error("Заказ или калькуляция не найдены");
    }
    const quote = recalculateAtelierQuote(order.atelierQuote);
    order.atelierQuote = quote;
    order.amount = quote.total;
    order.cost = quote.totalCost;
    order.profit = quote.grossProfit;

    const selected = selectQuoteRooms(quote, roomIds ?? quote.rooms.map((r) => r.id));
    if (!selected.rooms.length) {
      throw new Error("Выберите хотя бы одну комнату");
    }

    const client = data.clients.find(
      (c) => c.id === order.clientId && c.companyId === companyId,
    );
    const prefix = "КП-ZP-";
    const numbers = data.commercialProposals
      .filter((p) => p.companyId === companyId && p.number.startsWith(prefix))
      .map((p) => Number.parseInt(p.number.slice(prefix.length), 10))
      .filter((n) => !Number.isNaN(n));
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;

    proposal = {
      id: generateId("kp"),
      companyId,
      calculatorId: order.id,
      clientId: order.clientId,
      number: `${prefix}${String(next).padStart(3, "0")}`,
      items: atelierQuoteToProposalItems(selected),
      total: selected.total,
      terms: "Предоплата 50%. Срок изготовления уточняется после замера.",
      deadlineDays: 14,
      createdAt: nowIso(),
      orderId: order.id,
      discountPercent: selected.discountPercent,
      subtotalBeforeDiscount: selected.subtotal,
      discountAmount: selected.discountAmount,
      kind: "textiles",
      quoteSnapshot: selected,
      roomIds: selected.rooms.map((r) => r.id),
      clientName: client?.fullName ?? quote.clientName,
      clientPhone: client?.phone || quote.clientPhone || null,
      address: quote.address || order.address || client?.address || null,
      orderNumber: order.number,
      photos: proposalPhotos(order.media, selected.rooms.map((room) => room.id)),
    };
    copyPhotosOntoClient(data, companyId, order.clientId, order.media);
    data.commercialProposals.push(proposal);
    order.proposalId = proposal.id;
    order.updatedAt = nowIso();

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Сформировал КП ${proposal.number} для ${order.number}`,
      entityType: "proposal",
      entityId: proposal.id,
      createdAt: nowIso(),
    });
  });
  return proposal;
}

export function addOrderNote(
  companyId: string,
  orderId: string,
  text: string,
  actor: AtelierActor,
): EntityNote {
  let note!: EntityNote;
  mutateData((data) => {
    const order = data.orders.find(
      (o) => o.id === orderId && o.companyId === companyId && isActiveOrder(o),
    );
    if (!order) throw new Error("Заказ не найден");
    note = {
      id: generateId("note"),
      text,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      authorId: actor.id,
      authorName: actor.name,
    };
    if (!order.orderNotes) order.orderNotes = [];
    order.orderNotes.push(note);
    order.updatedAt = nowIso();
  });
  return note;
}

export function getCostingSummary(companyId: string) {
  const orders = getData().orders.filter(
    (o) =>
      o.companyId === companyId &&
      isActiveOrder(o) &&
      o.status !== "cancelled" &&
      o.atelierQuote,
  );
  return orders.map((o) => {
    const q = o.atelierQuote!;
    return {
      orderId: o.id,
      number: o.number,
      clientId: o.clientId,
      status: o.status,
      revenue: q.total,
      cost: q.totalCost,
      grossProfit: q.grossProfit,
      marginPercent: q.marginPercent,
      deadline: o.deadline,
      date: o.date,
    };
  });
}

/**
 * Заказ только в цех (без КП) виден швее в «Заказах на пошив».
 * Во вкладке «Заказы» у остальных он не показывается.
 */
export function orderVisibleInList(
  order: { sewingOrderAt?: string | null; proposalId?: string | null },
  role: string,
): boolean {
  const workshopOnly = Boolean(order.sewingOrderAt) && !order.proposalId;
  if (role === "SEAMSTRESS") return Boolean(order.sewingOrderAt || order.proposalId);
  return !workshopOnly;
}

export function listProposalPhotos(
  companyId: string,
  proposal: { orderId?: string | null; roomIds?: string[]; photos?: CommercialProposal["photos"] },
) {
  const data = getData();
  const order = proposal.orderId
    ? data.orders.find(
        (item) =>
          item.companyId === companyId &&
          isActiveOrder(item) &&
          (item.id === proposal.orderId || item.number === proposal.orderId),
      )
    : undefined;
  const roomIds = new Set(proposal.roomIds ?? []);
  const live = (order?.media ?? []).filter(
    (item) => item.type === "photo" && (!roomIds.size || !item.roomId || roomIds.has(item.roomId)),
  );
  const byUrl = new Map<string, { id: string; url: string; name: string }>();
  for (const photo of [...(proposal.photos ?? []), ...live]) {
    if (!byUrl.has(photo.url)) {
      byUrl.set(photo.url, { id: photo.id, url: photo.url, name: photo.name });
    }
  }
  return [...byUrl.values()];
}

function proposalPhotos(media: MediaItem[], roomIds: string[]) {
  const rooms = new Set(roomIds);
  return media
    .filter((item) => item.type === "photo" && (!item.roomId || rooms.has(item.roomId)))
    .map((item) => ({
      id: item.id,
      url: item.url,
      name: item.name,
      roomId: item.roomId ?? null,
    }));
}

export function getAtelierDashboardStats(companyId: string, role = "OWNER") {
  const orders = getData().orders.filter(
    (o) => o.companyId === companyId && isActiveOrder(o) && orderVisibleInList(o, role),
  );
  const today = todayDate();
  const overdue = orders.filter(
    (o) =>
      o.deadline < today &&
      o.status !== "draft" &&
      o.status !== "measurement" &&
      o.status !== "completed" &&
      o.status !== "cancelled",
  );
  const count = (status: AtelierOrderStatus) => orders.filter((o) => o.status === status).length;
  return {
    total: orders.length,
    draft: count("draft"),
    measurement: count("measurement"),
    awaiting: count("awaiting"),
    inWork: count("in_work"),
    completed: count("completed"),
    overdue: overdue.length,
  };
}
