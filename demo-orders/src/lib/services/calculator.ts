import { getData } from "@/lib/db";
import { normalizePhoneDigits } from "@/lib/utils";
import type { CommercialProposal } from "@/types";

export function getProposal(
  companyId: string,
  id: string,
): CommercialProposal | null {
  return (
    getData().commercialProposals.find(
      (p) => p.companyId === companyId && (p.id === id || p.number === id),
    ) ?? null
  );
}

export type ProposalListItem = CommercialProposal & {
  displayClientName: string;
  displayClientPhone: string;
  displayAddress: string;
};

/** Search by client name, phone (digits only) or object address. */
export function searchProposals(companyId: string, query: string): ProposalListItem[] {
  const data = getData();
  const clients = new Map(
    data.clients.filter((c) => c.companyId === companyId).map((c) => [c.id, c]),
  );
  const q = query.trim().toLowerCase();
  const qDigits = normalizePhoneDigits(q);

  return data.commercialProposals
    .filter((p) => p.companyId === companyId)
    .map((p) => {
      const client = p.clientId ? clients.get(p.clientId) : undefined;
      return {
        ...p,
        displayClientName: p.clientName ?? client?.fullName ?? "",
        displayClientPhone: p.clientPhone ?? client?.phone ?? "",
        displayAddress: p.address ?? p.quoteSnapshot?.address ?? client?.address ?? "",
      };
    })
    .filter((p) => {
      if (!q) return true;
      if (p.displayClientName.toLowerCase().includes(q)) return true;
      if (p.displayAddress.toLowerCase().includes(q)) return true;
      if (p.number.toLowerCase().includes(q)) return true;
      if (p.orderNumber?.toLowerCase().includes(q)) return true;
      if (qDigits.length < 3) return false;
      const phone = normalizePhoneDigits(p.displayClientPhone);
      return phone.includes(qDigits) || phone.includes(qDigits.replace(/^8/, "7"));
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
