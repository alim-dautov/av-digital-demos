import type { MetadataRoute } from "next";

/** Внутренняя CRM: поисковикам доступна только страница входа */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/login"], disallow: ["/"] }] };
}
