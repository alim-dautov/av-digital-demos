"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";

type ProvidersProps = {
  children: React.ReactNode;
};

function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "border border-border bg-panel text-foreground shadow-lg rounded-lg",
          title: "text-foreground",
          description: "text-muted-foreground",
          success: "border-success/30",
          error: "border-destructive/30",
          actionButton: "bg-primary text-primary-foreground rounded-sm",
          cancelButton: "bg-secondary text-secondary-foreground rounded-sm",
        },
      }}
    />
  );
}

export function Providers({ children }: ProvidersProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="mebeldemo-theme"
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user">
        {children}
        <ThemedToaster />
      </MotionConfig>
    </NextThemesProvider>
  );
}
