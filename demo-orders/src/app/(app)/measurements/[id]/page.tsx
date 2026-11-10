import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/features/proposals/print-button";
import { MeasurementPhotos } from "@/features/atelier-calculator/measurement-photos";
import { MeasurementSheet } from "@/features/atelier-calculator/measurement-sheet";
import { getSession, redirectInCompany } from "@/lib/auth";
import { buildAtelierProposalDocument } from "@/lib/domain/atelier-calc";
import { isTextilesCompany } from "@/lib/company";
import { getCompanyLogo } from "@/lib/company-apps";
import { can } from "@/lib/rbac";
import { getClientMeasurement } from "@/lib/services/client-measurements";
import { getCompany } from "@/lib/services/companies";

export default async function MeasurementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) return redirectInCompany("/login");
  if (!can(session, "calculator", "read") && !can(session, "clients", "read")) {
    return redirectInCompany("/");
  }
  if (!isTextilesCompany(session.companyId)) return redirectInCompany("/");

  const { id } = await params;
  const measurement = getClientMeasurement(session.companyId, id);
  if (!measurement) notFound();
  const company = getCompany(session.companyId);
  const document = buildAtelierProposalDocument(measurement.quote);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/clients/${measurement.clientId}`}>
            <ArrowLeft className="size-4" />
            К клиенту
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
        </div>
      </div>
      <p className="no-print text-sm text-muted-foreground">
        Чтобы отправить клиенту, откройте печать и сохраните страницу как PDF.
      </p>
      <MeasurementSheet
        companyName={company?.name ?? "Шторы Демо"}
        companyTagline={company?.tagline}
        logo={getCompanyLogo(session.companyId)?.full ?? null}
        companyPhone={company?.phone}
        number={measurement.number}
        createdAt={measurement.createdAt}
        clientName={measurement.quote.clientName}
        clientPhone={measurement.quote.clientPhone}
        address={measurement.address || measurement.quote.address}
        deadline={measurement.quote.deadline || null}
        document={document}
        photos={measurement.photos}
        photoActions={
          <MeasurementPhotos
            measurementId={measurement.id}
            photos={measurement.photos}
            canWrite={can(session, "calculator", "write")}
          />
        }
      />
    </div>
  );
}
