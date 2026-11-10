import { NextResponse } from "next/server";
import { companyManifest, getCompanyAppBySlug } from "@/lib/company-apps";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const app = getCompanyAppBySlug(slug);
  if (!app) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  return NextResponse.json(companyManifest(app), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
