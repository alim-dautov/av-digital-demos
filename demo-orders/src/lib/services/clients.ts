import { getData, mutateData } from "@/lib/db";
import { generateId, nowIso } from "@/lib/utils";
import type { Client, LeadSource, Order } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export type ClientDetail = Client & {
  orders: Order[];
};

export function listClients(companyId: string): Client[] {
  return getData()
    .clients.filter((c) => c.companyId === companyId)
    .sort((a, b) => (a.lastOrderAt ?? a.firstContactAt) < (b.lastOrderAt ?? b.firstContactAt) ? 1 : -1);
}

export function getClient(
  companyId: string,
  id: string,
): ClientDetail | null {
  const data = getData();
  const client = data.clients.find(
    (c) => c.companyId === companyId && c.id === id,
  );
  if (!client) return null;
  const orders = data.orders
    .filter((o) => o.clientId === client.id && isActiveOrder(o))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { ...client, orders };
}

export function createClient(
  companyId: string,
  input: {
    fullName: string;
    phone: string;
    whatsapp?: string | null;
    email?: string | null;
    source: LeadSource;
    comment?: string | null;
    address?: string | null;
  },
): Client {
  const client: Client = {
    id: generateId("client"),
    companyId,
    fullName: input.fullName,
    phone: input.phone,
    whatsapp: input.whatsapp ?? input.phone,
    email: input.email ?? null,
    source: input.source,
    firstContactAt: nowIso(),
    comment: input.comment ?? null,
    ordersCount: 0,
    totalAmount: 0,
    lastOrderAt: null,
    address: input.address?.trim() || null,
  };
  mutateData((data) => {
    data.clients.push(client);
  });
  return client;
}

export function searchClients(companyId: string, query: string): Client[] {
  const q = query.trim().toLowerCase();
  if (!q) return listClients(companyId);
  return listClients(companyId).filter(
    (c) =>
      c.fullName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.whatsapp?.includes(q) ?? false),
  );
}

const phoneDigits = (phone: string) => phone.replace(/\D/g, "");

/**
 * Client for a new order typed inline (name + phone). An existing client of the
 * same company with the same phone is reused instead of creating a duplicate.
 */
export function findOrCreateOrderClient(
  companyId: string,
  input: { fullName: string; phone: string; source: LeadSource },
): Client {
  const digits = phoneDigits(input.phone);
  const existing =
    digits.length >= 6
      ? listClients(companyId).find((c) => phoneDigits(c.phone) === digits)
      : undefined;
  if (existing) return existing;
  return createClient(companyId, {
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    source: input.source,
  });
}
