"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "touch-manipulation inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium transition-none active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [@media(hover:hover)]:hover:bg-primary/90 active:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground border border-border [@media(hover:hover)]:hover:bg-foreground/[0.08] active:bg-foreground/15",
        outline:
          "border border-border bg-transparent text-foreground [@media(hover:hover)]:hover:bg-foreground/[0.06] [@media(hover:hover)]:hover:border-foreground/20 active:bg-foreground/10",
        ghost: "text-foreground [@media(hover:hover)]:hover:bg-foreground/[0.06] active:bg-foreground/15",
        destructive:
          "bg-destructive text-destructive-foreground [@media(hover:hover)]:hover:bg-destructive/90 active:bg-destructive/80",
        link: "text-primary underline-offset-4 [@media(hover:hover)]:hover:underline",
      },
      size: {
        default: "min-h-[52px] px-5 py-3",
        sm: "min-h-12 min-w-12 rounded-md px-4 text-base",
        lg: "min-h-14 rounded-lg px-6",
        icon: "size-12",
        block: "min-h-14 w-full px-5 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
