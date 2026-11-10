import type { CSSProperties } from "react";

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--popover-foreground)",
};

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--muted-foreground)",
};

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "var(--popover-foreground)",
};
