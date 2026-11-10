import { getData, mutateData } from "@/lib/db";
import { isFurnitureCompany } from "@/lib/company";
import {
  furnitureQuoteToProposalItems,
  calculateQuickFurnitureEstimate,
  recalculateFurnitureQuote,
} from "@/lib/domain/furniture/quote";
import { listFurniturePrices } from "@/lib/services/furniture-catalog";
import { createOrder, type Actor } from "@/lib/services/orders";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import type {
  CommercialProposal,
  FurnitureCostLine,
  FurnitureQuoteSnapshot,
  Order,
} from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

const MATERIAL_KEYS = ["sheet:", "hdf", "edge", "facade", "countertop"];
const HARDWARE_KEYS = ["hinges", "slides", "legs", "crabs"];

function noteFrom(lines: FurnitureCostLine[], keys: string[]): string | null {
  const picked = lines.filter((l) => keys.some((k) => l.key.startsWith(k)));
  if (picked.length === 0) return null;
  return picked.map((l) => `${l.label} — ${l.quantity} ${l.unit}`).join(", ");
}

function resolveClientId(companyId: string, quote: FurnitureQuoteSnapshot): string {
  if (quote.clientId) {
    const exists = getData().clients.some(
      (c) => c.id === quote.clientId && c.companyId === companyId,
    );
    if (exists) return quote.clientId;
  }
  const name = quote.clientName.trim();
  if (!name) throw new Error("Укажите клиента");

  let clientId = "";
  mutateData((data) => {
    const existing = data.clients.find(
      (c) =>
        c.companyId === companyId &&
        ((quote.clientPhone && c.phone === quote.clientPhone) ||
          c.fullName.toLowerCase() === name.toLowerCase()),
    );
    if (existing) {
      clientId = existing.id;
      if (quote.address) existing.address = quote.address;
      if (quote.clientPhone) existing.phone = quote.clientPhone;
      return;
    }
    clientId = generateId("cli");
    data.clients.push({
      id: clientId,
      companyId,
      fullName: name,
      phone: quote.clientPhone || "",
      whatsapp: quote.clientPhone || null,
      email: null,
      source: "other",
      firstContactAt: todayDate(),
      comment: null,
      ordersCount: 0,
      totalAmount: 0,
      lastOrderAt: null,
      address: quote.address || null,
      photos: [],
      notes: [],
    });
  });
  return clientId;
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function saveFurnitureDraft(
  companyId: string,
  input: { orderId?: string | null; quote: FurnitureQuoteSnapshot },
  actor: Actor,
): Order {
  if (!isFurnitureCompany(companyId)) {
    throw new Error("Доступно только для мебельного производства");
  }
  const prices = listFurniturePrices(companyId);
  const quote = recalculateFurnitureQuote(input.quote, prices);
  if (quote.calculationMode === "quick") {
    if ((quote.quickEstimate?.linearMeters ?? 0) <= 0) {
      throw new Error("Укажите длину изделия");
    }
  } else if (quote.modules.length === 0) {
    throw new Error("Добавьте хотя бы один модуль");
  }

  const clientId = resolveClientId(companyId, quote);
  const client = getData().clients.find((c) => c.id === clientId);
  quote.clientId = clientId;
  quote.clientName = client?.fullName ?? quote.clientName;

  const lines = quote.result?.costLines ?? [];
  const materialsNote = noteFrom(lines, MATERIAL_KEYS);
  const hardwareNote = noteFrom(lines, HARDWARE_KEYS);
  const quick =
    quote.calculationMode === "quick"
      ? calculateQuickFurnitureEstimate(quote.quickEstimate ?? { linearMeters: 0, heightMeters: 2.5, tariff: "ldsp_budget" })
      : null;
  const units = quick ? Math.ceil(quick.linearMeters) : quote.modules.reduce((s, m) => s + m.quantity, 0);
  const description = quick
    ? `${quote.projectName || "Корпусная мебель"}: ${quick.linearMeters} п.м. · ${quick.tariff.label} · высота ${quick.heightMeters} м`
    : `${quote.projectName || "Корпусная мебель"}: ${units} мод.`;

  if (input.orderId) {
    let result: Order | null = null;
    mutateData((data) => {
      const order = data.orders.find(
        (o) =>
          o.companyId === companyId &&
          isActiveOrder(o) &&
          (o.id === input.orderId || o.number === input.orderId),
      );
      if (!order) return;
      order.clientId = clientId;
      order.amount = quote.total;
      order.cost = quote.totalCost;
      order.profit = quote.grossProfit;
      order.deadline = quote.deadline || order.deadline;
      order.address = quote.address || order.address;
      order.description = description;
      order.furnitureUnits = units;
      order.materialsNote = materialsNote;
      order.hardwareNote = hardwareNote;
      order.furnitureQuote = quote;
      order.updatedAt = nowIso();
      result = { ...order };
    });
    if (!result) throw new Error("Заказ не найден");
    return result;
  }

  const created = createOrder(
    companyId,
    {
      clientId,
      source: client?.source ?? "other",
      status: "lead",
      amount: quote.total,
      cost: quote.totalCost,
      deadline: quote.deadline || daysFromNow(21),
      responsibleId: actor.id,
      description,
      furnitureUnits: units,
      materialsNote,
      hardwareNote,
      stages: ["cutting", "edging", "drilling", "assembly", "installation"],
    },
    actor,
  );

  let result!: Order;
  mutateData((data) => {
    const order = data.orders.find((o) => o.id === created.id);
    if (!order) throw new Error("Заказ не найден");
    order.furnitureQuote = quote;
    order.address = quote.address || null;
    result = { ...order };
  });
  return result;
}

export function createFurnitureProposal(
  companyId: string,
  orderId: string,
  actor: Actor,
): CommercialProposal {
  const prices = listFurniturePrices(companyId);
  let proposal!: CommercialProposal;
  mutateData((data) => {
    const order = data.orders.find(
      (o) => o.id === orderId && o.companyId === companyId && isActiveOrder(o),
    );
    if (!order?.furnitureQuote) throw new Error("Заказ или калькуляция не найдены");
    const quote = recalculateFurnitureQuote(order.furnitureQuote, prices);
    order.furnitureQuote = quote;

    const numbers = data.commercialProposals
      .filter((p) => p.companyId === companyId)
      .map((p) => Number.parseInt(p.number.replace(/\D/g, ""), 10))
      .filter((n) => !Number.isNaN(n));
    const next = (numbers.length ? Math.max(...numbers) : 100) + 1;

    proposal = {
      id: generateId("kp"),
      companyId,
      calculatorId: order.id,
      clientId: order.clientId,
      number: `КП-${next}`,
      items: furnitureQuoteToProposalItems(quote),
      total: quote.total,
      terms: "Предоплата 50%. Срок изготовления уточняется после замера.",
      deadlineDays: 21,
      createdAt: nowIso(),
      orderId: order.id,
      discountPercent: quote.discountPercent,
      subtotalBeforeDiscount: quote.subtotal,
      kind: "furniture",
    };
    data.commercialProposals.push(proposal);
    order.proposalId = proposal.id;
    order.updatedAt = nowIso();

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Сформировал КП ${proposal.number} для заказа №${order.number}`,
      entityType: "proposal",
      entityId: proposal.id,
      createdAt: nowIso(),
    });
  });
  return proposal;
}
