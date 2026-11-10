import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg bg-foreground/[0.07] motion-safe:animate-pulse",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
