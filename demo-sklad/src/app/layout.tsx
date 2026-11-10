import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Electro Demo CRM", template: "%s · Electro Demo CRM" },
  description: "CRM и складской учёт Electro Demo: заявки, склад, оплаты, задачи, зарплата",
  applicationName: "Electro Demo CRM",
  appleWebApp: { capable: true, title: "DEMO", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/brand/icon.svg", type: "image/svg+xml" }, { url: "/brand/icons/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/brand/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // iPhone не увеличивает страницу при фокусе в поле (шрифт полей 14px); щипок для увеличения в Safari остаётся
  maximumScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0B2B54" }, { media: "(prefers-color-scheme: dark)", color: "#051428" }],
};

/** Тема применяется до отрисовки, чтобы не мигало */
const themeScript = `try{var t=localStorage.getItem("demo-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* кириллица основных начертаний — сразу, без ожидания CSS (LCP) */}
        {[400, 600, 700, 800].map((w) => <link key={w} rel="preload" href={`/fonts/manrope-cyrillic-${w}-normal.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />)}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
