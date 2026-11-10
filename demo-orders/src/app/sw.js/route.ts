import { ROOT_SW, serviceWorkerSource, SW_HEADERS } from "@/lib/pwa/service-worker";

export const dynamic = "force-static";

export function GET() {
  return new Response(serviceWorkerSource(ROOT_SW), {
    headers: { ...SW_HEADERS, "Service-Worker-Allowed": "/" },
  });
}
