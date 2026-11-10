"use client";
import dynamic from "next/dynamic";
import { startTransition, useEffect, useState, type ComponentType } from "react";
import { Skeleton } from "@/components/ui";

/** Графики грузятся лениво — recharts не попадает в основной бандл */
const loading = () => <Skeleton className="h-[240px] w-full rounded-xl" />;
const RevenueChartL = dynamic(() => import("./charts").then((m) => m.RevenueChart), { ssr: false, loading });
const BarsChartL = dynamic(() => import("./charts").then((m) => m.BarsChart), { ssr: false, loading });
const DonutChartL = dynamic(() => import("./charts").then((m) => m.DonutChart), { ssr: false, loading });
const PlanChartL = dynamic(() => import("./charts").then((m) => m.PlanChart), { ssr: false, loading });

/** Монтирует график, когда он подъезжает к экрану и браузер свободен: невидимые графики не тратят CPU, а работа графика не склеивается с гидрацией */
function useVisibleIdle() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!el || ready) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let idle = 0, timer: ReturnType<typeof setTimeout> | undefined;
    // startTransition — React рендерит график с уступками главному потоку (без одной длинной задачи)
    const show = () => startTransition(() => setReady(true));
    const go = () => { if (w.requestIdleCallback) idle = w.requestIdleCallback(show, { timeout: 1200 }); else timer = setTimeout(show, 150); };
    if (!("IntersectionObserver" in window)) { go(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => { io.disconnect(); if (idle) w.cancelIdleCallback?.(idle); if (timer) clearTimeout(timer); };
  }, [el, ready]);
  return { ref: setEl, ready };
}
function deferred<P extends object>(C: ComponentType<P>) {
  return function Deferred(props: P) {
    const { ref, ready } = useVisibleIdle();
    const h = (props as { height?: number }).height ?? 240;
    if (!ready) return <div ref={ref} style={{ height: h }}><Skeleton className="h-full w-full rounded-xl" /></div>;
    return <C {...props} />;
  };
}

export const RevenueChart = deferred(RevenueChartL);
export const BarsChart = deferred(BarsChartL);
export const DonutChart = deferred(DonutChartL);
export const PlanChart = deferred(PlanChartL);
