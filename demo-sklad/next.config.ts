import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "pg", "@react-pdf/renderer", "exceljs", "web-push", "bcryptjs"],
  poweredByHeader: false,
  // Сборка для cPanel (scripts/build-cpanel.mjs): без sharp — его бинарники под Windows не запустятся на Linux-хостинге
  images: process.env.NEXT_IMAGES_UNOPTIMIZED === "1" ? { unoptimized: true } : undefined,
  experimental: {
    serverActions: { bodySizeLimit: "15mb" },
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
export default nextConfig;
