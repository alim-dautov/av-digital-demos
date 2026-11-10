"use client";

import { useEffect, useState } from "react";

function sameDocument(next: URL, here: URL) {
  return next.pathname === here.pathname && next.search === here.search;
}

/** Top bar that starts on the finger-down of an internal link, before the route commits. */
export function RouteProgress({ pathname }: { pathname: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;
      let next: URL;
      try {
        next = new URL(anchor.href);
      } catch {
        return;
      }
      if (next.origin !== window.location.origin) return;
      if (sameDocument(next, new URL(window.location.href))) return;
      setVisible(true);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden bg-primary/25"
      role="progressbar"
      aria-valuetext="Загрузка"
    >
      <div className="route-progress-bar h-full w-1/3 bg-primary" />
    </div>
  );
}
