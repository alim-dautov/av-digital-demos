"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCompanyLogo } from "@/lib/company-apps";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

type CompanySwitcherProps = {
  companies: Company[];
  activeCompanyId: string;
};

export function CompanySwitcher({
  companies,
  activeCompanyId,
}: CompanySwitcherProps) {
  const router = useRouter();
  const active =
    companies.find((c) => c.id === activeCompanyId) ?? companies[0];
  const mark = active?.logoUrl ? { src: active.logoUrl, width: 32, height: 32 } : active && active.logoUrl !== null ? getCompanyLogo(active.id)?.mark : null;
  const markImg = mark ? (
    <img
      src={mark.src}
      width={mark.width}
      height={mark.height}
      alt=""
      className="h-8 w-auto shrink-0 md:hidden"
    />
  ) : null;

  async function selectCompany(company: Company) {
    if (company.id === activeCompanyId) return;

    const res = await fetch("/api/auth/switch-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: company.id }),
    });

    if (!res.ok) return;

    if (company.status === "coming_soon") {
      router.push("/company-placeholder");
    } else {
      router.push("/");
    }
    router.refresh();
  }

  if (companies.length <= 1) {
    return (
      <span className="flex items-center gap-2 px-1">
        {markImg}
        <span className="max-w-[160px] truncate text-sm font-medium">
          {active?.name ?? "Компания"}
        </span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 gap-2 border-border bg-panel-elevated px-3 font-medium",
            markImg && "pl-2 md:pl-3",
          )}
        >
          {markImg}
          <span className="max-w-[140px] truncate">{active?.name ?? "Компания"}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Компании</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((company) => {
          const isActive = company.id === activeCompanyId;
          return (
            <DropdownMenuItem
              key={company.id}
              onSelect={() => selectCompany(company)}
              className="flex items-center justify-between gap-2"
            >
              {company.logoUrl && <img src={company.logoUrl} alt="" className="size-8 shrink-0 object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{company.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {company.status === "coming_soon"
                    ? "Скоро"
                    : company.tagline}
                </p>
              </div>
              <Check
                className={cn(
                  "size-4 shrink-0 text-primary",
                  !isActive && "opacity-0",
                )}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
