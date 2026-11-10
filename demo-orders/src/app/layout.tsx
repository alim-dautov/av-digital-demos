import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";
import {
  COMPANY_APP_HEADER,
  companyIconPath,
  companyScopeScript,
  getCompanyAppBySlug,
} from "@/lib/company-apps";
import "./globals.css";

const defaultMetadata: Metadata = {
  title: "Mebel Demo",
  description: "Mebel Demo — управление производством мебели на заказ",
  applicationName: "Mebel Demo",
  openGraph: {
    title: "Mebel Demo",
    description: "Mebel Demo — управление производством мебели на заказ",
    images: [{ url: "/app-icons/og.png", width: 1200, height: 630, alt: "Mebel Demo" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mebel Demo",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/app-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const slug = (await headers()).get(COMPANY_APP_HEADER);
  const app = slug ? getCompanyAppBySlug(slug) : null;
  if (!app) return defaultMetadata;
  return {
    title: app.name,
    description: app.description,
    applicationName: app.name,
    manifest: `/c/${app.slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: app.shortName,
    },
    icons: {
      icon: [
        { url: companyIconPath(app.slug, 192), sizes: "192x192", type: "image/png" },
        { url: companyIconPath(app.slug, 512), sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: companyIconPath(app.slug, 180), sizes: "180x180", type: "image/png" }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const slug = (await headers()).get(COMPANY_APP_HEADER);
  const app = slug ? getCompanyAppBySlug(slug) : null;
  return {
    themeColor: app?.themeColor ?? "#0B0D0B",
    viewportFit: "cover",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const slug = (await headers()).get(COMPANY_APP_HEADER);
  const app = slug ? getCompanyAppBySlug(slug) : null;
  const scopeScript = app ? companyScopeScript(app.slug) : "";

  return (
    <html
      lang="ru"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        {scopeScript ? (
          <script dangerouslySetInnerHTML={{ __html: scopeScript }} />
        ) : null}
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
