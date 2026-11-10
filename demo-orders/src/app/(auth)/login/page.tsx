import { headers } from "next/headers";
import { Suspense } from "react";
import { COMPANY_APP_HEADER, getCompanyAppBySlug } from "@/lib/company-apps";
import { demoAccountsEnabled } from "@/lib/env";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const slug = (await headers()).get(COMPANY_APP_HEADER);
  const app = slug ? getCompanyAppBySlug(slug) : null;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
          Загрузка…
        </div>
      }
    >
      <LoginForm
        demoEnabled={demoAccountsEnabled()}
        brand={
          app
            ? {
                name: app.name,
                tagline: app.description,
                slug: app.slug,
                logo: app.logo?.full ?? null,
              }
            : null
        }
      />
    </Suspense>
  );
}
