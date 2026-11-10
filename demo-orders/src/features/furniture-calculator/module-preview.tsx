import type { FurnitureModule } from "@/types";
import { cn } from "@/lib/utils";
import { PLINTH } from "@/lib/domain/furniture/modules";
import { LEG_HEIGHT as LEG, facadeRects } from "@/lib/domain/furniture/layout3d";

export function moduleFootHeight(m: FurnitureModule): number {
  if (m.kind === "base") return LEG;
  return 0;
}

/** Draws one module front view at (x, y) in mm; y is the carcass top. */
export function ModuleShape({
  module: m,
  x = 0,
  y = 0,
  highlighted = false,
  showFacades = true,
}: {
  module: FurnitureModule;
  x?: number;
  y?: number;
  highlighted?: boolean;
  showFacades?: boolean;
}) {
  const carcassH = m.kind === "tall" ? m.height - PLINTH : m.height;
  const stroke = Math.max(6, Math.min(m.width, m.height) / 60);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={0}
        y={0}
        width={m.width}
        height={carcassH}
        className={cn(
          "transition-[fill] duration-150",
          highlighted ? "fill-primary/15 stroke-primary" : "fill-panel-elevated stroke-foreground/35",
        )}
        strokeWidth={stroke}
      />
      {showFacades &&
        facadeRects(m).map((f, i) => (
          <g key={i}>
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              className={highlighted ? "fill-primary/10 stroke-primary/70" : "fill-foreground/[0.04] stroke-foreground/25"}
              strokeWidth={stroke * 0.7}
            />
            {f.drawer ? (
              <line
                x1={f.x + f.w * 0.35}
                x2={f.x + f.w * 0.65}
                y1={f.y + Math.min(60, f.h * 0.3)}
                y2={f.y + Math.min(60, f.h * 0.3)}
                className="stroke-foreground/50"
                strokeWidth={stroke * 1.4}
                strokeLinecap="round"
              />
            ) : (
              <line
                x1={f.hingeLeft ? f.x + f.w - 50 : f.x + 50}
                x2={f.hingeLeft ? f.x + f.w - 50 : f.x + 50}
                y1={m.kind === "wall" || m.kind === "mezzanine" ? f.y + f.h - Math.min(260, f.h * 0.45) : f.y + 60}
                y2={m.kind === "wall" || m.kind === "mezzanine" ? f.y + f.h - 60 : f.y + Math.min(260, f.h * 0.45)}
                className="stroke-foreground/50"
                strokeWidth={stroke * 1.4}
                strokeLinecap="round"
              />
            )}
          </g>
        ))}
      {m.kind === "tall" && (
        <rect
          x={stroke}
          y={carcassH}
          width={m.width - stroke * 2}
          height={PLINTH}
          className="fill-foreground/10"
        />
      )}
      {m.kind === "base" && (
        <>
          <rect x={40} y={carcassH} width={30} height={LEG} className="fill-foreground/30" />
          <rect x={m.width - 70} y={carcassH} width={30} height={LEG} className="fill-foreground/30" />
        </>
      )}
    </g>
  );
}

export function ModulePreview({
  module: m,
  className,
  highlighted,
}: {
  module: FurnitureModule;
  className?: string;
  highlighted?: boolean;
}) {
  const pad = 20;
  const totalH = m.height + moduleFootHeight(m);
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${m.width + pad * 2} ${totalH + pad * 2}`}
      className={cn("h-full w-full", className)}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
    >
      <ModuleShape module={m} highlighted={highlighted} />
    </svg>
  );
}
