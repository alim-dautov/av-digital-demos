import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { getSession } from "@/lib/auth";
import { getCompanyLogo } from "@/lib/company-apps";
import { can } from "@/lib/rbac";
import { getProposal } from "@/lib/services/calculator";
import { getClient } from "@/lib/services/clients";
import { getCompany } from "@/lib/services/companies";
import {
  ProposalPdfDocument,
  type ProposalPdfData,
} from "@/features/calculator/proposal-pdf";
import { buildAtelierProposalDocument } from "@/lib/domain/atelier-calc";
import { buildRenovationProposalDocument } from "@/lib/domain/renovation/quote";
import { listProposalPhotos } from "@/lib/services/atelier-orders";
import { uploadPath } from "@/lib/uploads";

function photoFile(url: string): string | null {
  const params = new URL(url, "http://local").searchParams;
  const companyId = params.get("companyId");
  const entityType = params.get("entityType");
  const entityId = params.get("entityId");
  const file = params.get("file");
  if (!companyId || !entityType || !entityId || !file) return null;
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png") return null;
  const full = uploadPath(companyId, entityType, entityId, file);
  return fs.existsSync(full) ? full : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (!can(session, "calculator", "read")) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await context.params;
    const proposal = getProposal(session.companyId, id);
    if (!proposal) {
      return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    }

    const company = getCompany(session.companyId);
    const client = proposal.clientId
      ? getClient(session.companyId, proposal.clientId)
      : null;

    const snapshot = proposal.quoteSnapshot ?? null;
    const renovationSnapshot = proposal.renovationSnapshot ?? null;
    const logo = getCompanyLogo(session.companyId);
    const data: ProposalPdfData = {
      number: proposal.number,
      createdAt: proposal.createdAt,
      companyName: company?.name ?? "Mebel Demo",
      companyTagline: company?.tagline ?? "мебель на заказ",
      logoFile: logo ? path.join(process.cwd(), "public", logo.full.printSrc) : null,
      clientName: proposal.clientName ?? client?.fullName ?? null,
      clientPhone: proposal.clientPhone ?? client?.phone ?? null,
      address:
        proposal.address ??
        renovationSnapshot?.address ??
        snapshot?.address ??
        client?.address ??
        null,
      orderNumber: proposal.orderNumber ?? null,
      items: proposal.items,
      document: snapshot ? buildAtelierProposalDocument(snapshot, "client") : null,
      renovation: renovationSnapshot
        ? buildRenovationProposalDocument(renovationSnapshot)
        : null,
      accent:
        proposal.kind === "textiles"
          ? "#B8893B"
          : proposal.kind === "renovation"
            ? "#3D5A40"
            : undefined,
      total: proposal.total,
      terms: proposal.terms,
      deadlineDays: proposal.deadlineDays,
      contacts: {
        phone: company?.phone ?? "+7 (727) 000-00-00",
        email: company?.email ?? "hello@example.com",
        address: company?.address ?? "Алматы",
      },
      photos: listProposalPhotos(session.companyId, proposal).flatMap((photo) => {
        const file = photoFile(photo.url);
        return file ? [{ src: file, name: photo.name }] : [];
      }),
    };

    const doc = createElement(ProposalPdfDocument, { data });
    const buffer = await renderToBuffer(
      doc as Parameters<typeof renderToBuffer>[0],
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="proposal-${proposal.id}.pdf"; filename*=UTF-8''${encodeURIComponent(proposal.number)}.pdf`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("proposal pdf failed", e);
    return NextResponse.json({ error: "Не удалось сформировать PDF" }, { status: 500 });
  }
}
