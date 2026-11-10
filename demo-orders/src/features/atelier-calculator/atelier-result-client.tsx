"use client";

import dynamic from "next/dynamic";
import type { CompanyLogo } from "@/lib/company-apps";

const AtelierResult = dynamic(
  () => import("./atelier-result").then((mod) => mod.AtelierResult),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Загрузка расчёта…</p>,
  },
);

export function AtelierResultClient({
  canWrite,
  logo,
}: {
  canWrite: boolean;
  logo: CompanyLogo["full"] | null;
}) {
  return <AtelierResult canWrite={canWrite} logo={logo} />;
}
