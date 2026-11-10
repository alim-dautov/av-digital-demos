import { getCompanyAppBySlug } from "@/lib/company-apps";
import { companySwConfig, serviceWorkerSource, SW_HEADERS } from "@/lib/pwa/service-worker";

/** Company-scoped worker: scope /c/<slug>/, own cache, own icons. */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const app = getCompanyAppBySlug(slug);
  if (!app) return new Response("Not found", { status: 404 });
  return new Response(serviceWorkerSource(companySwConfig(app)), { headers: SW_HEADERS });
}
