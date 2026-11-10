import { getData, mutateData } from "@/lib/db";
import { isRenovationCompany } from "@/lib/company";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import {
  enabledRenovationItems,
  normalizeRenovationQuote,
  renovationQuoteToProposalItems,
} from "@/lib/domain/renovation/quote";
import { createOrder, type Actor } from "@/lib/services/orders";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import type { CommercialProposal, Order, RenovationQuoteSnapshot } from "@/types";

function resolveClientId(companyId: string, quote: RenovationQuoteSnapshot): string {
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

export function saveRenovationDraft(
  companyId: string,
  input: { orderId?: string | null; quote: RenovationQuoteSnapshot },
  actor: Actor,
): Order {
  if (!isRenovationCompany(companyId)) {
    throw new Error("Доступно только для Компании 3");
  }
  const quote = normalizeRenovationQuote(input.quote);
  const enabled = enabledRenovationItems(quote);
  if (enabled.length === 0) throw new Error("Включите хотя бы один пункт");

  const clientId = resolveClientId(companyId, quote);
  const client = getData().clients.find((c) => c.id === clientId);
  quote.clientId = clientId;
  quote.clientName = client?.fullName ?? quote.clientName;

  const n = enabled.length;
  const description =
    quote.projectName.trim() ||
    `Ремонт: ${n} пункт${n === 1 ? "" : n < 5 ? "а" : "ов"}`;

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
      order.cost = 0;
      order.profit = quote.total;
      order.deadline = quote.deadline || order.deadline;
      order.address = quote.address || order.address;
      order.description = description;
      order.renovationQuote = quote;
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
      cost: 0,
      deadline: quote.deadline || daysFromNow(45),
      responsibleId: actor.id,
      description,
      stages: ["cutting", "assembly", "installation"],
    },
    actor,
  );

  let result!: Order;
  mutateData((data) => {
    const order = data.orders.find((o) => o.id === created.id);
    if (!order) throw new Error("Заказ не найден");
    order.renovationQuote = quote;
    order.address = quote.address || null;
    result = { ...order };
  });
  return result;
}

export function createRenovationProposal(
  companyId: string,
  orderId: string,
  actor: Actor,
): CommercialProposal {
  let proposal!: CommercialProposal;
  mutateData((data) => {
    const order = data.orders.find(
      (o) => o.id === orderId && o.companyId === companyId && isActiveOrder(o),
    );
    if (!order?.renovationQuote) throw new Error("Заказ или калькуляция не найдены");
    const quote = normalizeRenovationQuote(order.renovationQuote);
    order.renovationQuote = quote;
    order.amount = quote.total;
    order.profit = quote.total;

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
      items: renovationQuoteToProposalItems(quote),
      total: quote.total,
      terms: "Предоплата 50%. Срок и состав работ уточняются после осмотра объекта.",
      deadlineDays: 45,
      createdAt: nowIso(),
      orderId: order.id,
      kind: "renovation",
      renovationSnapshot: quote,
      clientName: quote.clientName,
      clientPhone: quote.clientPhone,
      address: quote.address,
      orderNumber: order.number,
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
