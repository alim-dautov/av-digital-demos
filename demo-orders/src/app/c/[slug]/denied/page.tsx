import { notFound } from "next/navigation";
import { getCompanyAppBySlug } from "@/lib/company-apps";
import { CompanyDenied } from "@/components/company-denied";

export default async function CompanyDeniedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = getCompanyAppBySlug(slug);
  if (!app) notFound();
  return <CompanyDenied name={app.name} slug={app.slug} />;
}
