"use client";

import { useEffect } from "react";
import { swLocation } from "@/lib/pwa/sw-location";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_PWA_DEV !== "true"
    ) {
      // Dev chunk URLs are not content-hashed, so a cache-first worker serves stale CSS/JS.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => void reg.unregister());
      });
      return;
    }

    const register = () => {
      const { script, scope } = swLocation(window.location.pathname);
      navigator.serviceWorker.register(script, { scope }).catch(() => {
        /* ignore */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
