import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type DashboardCardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
  titleId?: string;
  className?: string;
};

export function DashboardCardLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="-mr-2 shrink-0 text-muted-foreground hover:text-foreground"
    >
      <Link href={href}>
        {children}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
}

export function DashboardCardHeader({
  title,
  description,
  href,
  linkLabel = "Все",
  titleId,
  className,
}: DashboardCardHeaderProps) {
  return (
    <CardHeader
      className={cn(
        "flex-row items-start justify-between gap-3 space-y-0",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <CardTitle id={titleId}>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {href ? <DashboardCardLink href={href}>{linkLabel}</DashboardCardLink> : null}
    </CardHeader>
  );
}
