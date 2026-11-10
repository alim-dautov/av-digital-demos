import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-2 inline-flex h-8 items-center gap-1 rounded-lg pr-2 text-sm font-semibold text-ink-3 transition-colors hover:text-ink">
      <ChevronLeft className="size-4" />{children}
    </Link>
  );
}
