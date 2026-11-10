import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calculator, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { getCompanyLogo } from "@/lib/company-apps";
import { can } from "@/lib/rbac";
import { getProposal } from "@/lib/services/calculator";
import { getClient } from "@/lib/services/clients";
import { listProposalPhotos } from "@/lib/services/atelier-orders";
import { getCompany } from "@/lib/services/companies";
import { buildAtelierProposalDocument } from "@/lib/domain/atelier-calc";
import { ProposalDocumentView } from "@/features/proposals/proposal-document";
import { PrintButton } from "@/features/proposals/print-button";

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  if (!can(session, "proposals", "read") && !can(session, "calculator", "read")) {
    redirect("/");
  }

  const { id } = await params;
  const proposal = getProposal(session.companyId, id);
  if (!proposal) notFound();

  const company = getCompany(session.companyId);
  const client = proposal.clientId ? getClient(session.companyId, proposal.clientId) : null;
  const snapshot = proposal.quoteSnapshot ?? null;
  const photos = listProposalPhotos(session.companyId, proposal);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/proposals">
            <ArrowLeft className="size-4" /> Все КП
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {snapshot && can(session, "calculator", "read") && (
            <Button variant="outline" asChild>
              <Link href={`/calculator?proposal=${proposal.id}`}>
                <Calculator className="size-4" /> Открыть в калькуляторе
              </Link>
            </Button>
          )}
          <PrintButton />
          <Button asChild>
            <a href={`/api/calculator/proposal/${proposal.id}/pdf`} download>
              <Download className="size-4" /> PDF
            </a>
          </Button>
        </div>
      </div>

      <ProposalDocumentView
        data={{
          number: proposal.number,
          createdAt: proposal.createdAt,
          orderNumber: proposal.orderNumber ?? null,
          companyName: company?.name ?? "",
          companyTagline: company?.tagline ?? "",
          logo: getCompanyLogo(session.companyId)?.full ?? null,
          companyContacts: {
            phone: company?.phone ?? undefined,
            email: company?.email ?? undefined,
            address: company?.address ?? undefined,
          },
          clientName: proposal.clientName ?? client?.fullName ?? "",
          clientPhone: proposal.clientPhone ?? client?.phone ?? "",
          address: proposal.address ?? snapshot?.address ?? client?.address ?? "",
          document: snapshot ? buildAtelierProposalDocument(snapshot, "client") : null,
          items: proposal.items,
          total: proposal.total,
          terms: proposal.terms,
          deadlineDays: proposal.deadlineDays,
          accent: proposal.kind === "textiles" ? "#B8893B" : "#E98C55",
          photos,
        }}
      />
    </div>
  );
}
