import {
  RENOVATION_BLOCKS,
  RENOVATION_SECTION_LABELS,
  RENOVATION_WORK_STAGES,
  getRenovationBlock,
  type RenovationSectionKey,
} from "./catalog";
import type {
  RenovationBlockLine,
  RenovationItemLine,
  RenovationQuoteSnapshot,
} from "@/types";

/** Legacy block shape before per-item pricing. */
type LegacyBlockLine = {
  id: string;
  enabled?: boolean;
  comment?: string;
  price?: number;
  items?: RenovationItemLine[];
};

function emptyItem(id: string): RenovationItemLine {
  return { id, enabled: false, comment: "", price: 0 };
}

export function emptyRenovationQuote(): RenovationQuoteSnapshot {
  return {
    clientId: null,
    clientName: "",
    clientPhone: "",
    address: "",
    projectName: "",
    deadline: "",
    blocks: RENOVATION_BLOCKS.map((def) => ({
      id: def.id,
      items: def.items.map((i) => emptyItem(i.id)),
    })),
    total: 0,
    calculatedAt: null,
  };
}

function migrateBlock(
  def: (typeof RENOVATION_BLOCKS)[number],
  existing: LegacyBlockLine | undefined,
): RenovationBlockLine {
  const byId = new Map(
    (existing?.items ?? []).map((i) => [i.id, i] as const),
  );
  const hasItemState = Array.isArray(existing?.items) && existing.items.length > 0;
  const legacyEnabled = Boolean(existing?.enabled);
  const legacyPrice = Math.max(0, Number(existing?.price) || 0);
  const legacyComment = (existing?.comment ?? "").trim();

  const items: RenovationItemLine[] = def.items.map((itemDef, index) => {
    const saved = byId.get(itemDef.id);
    if (hasItemState) {
      return {
        id: itemDef.id,
        enabled: Boolean(saved?.enabled),
        comment: (saved?.comment ?? "").trim(),
        price: Math.max(0, Number(saved?.price) || 0),
      };
    }
    // Legacy: whole block on/off with a single price → keep sum on first item.
    if (legacyEnabled) {
      return {
        id: itemDef.id,
        enabled: true,
        comment: index === 0 ? legacyComment : "",
        price: index === 0 ? legacyPrice : 0,
      };
    }
    return emptyItem(itemDef.id);
  });

  return { id: def.id, items };
}

export function normalizeRenovationQuote(
  input: Partial<RenovationQuoteSnapshot> | null | undefined,
): RenovationQuoteSnapshot {
  const base = emptyRenovationQuote();
  if (!input) return base;

  const byId = new Map(
    ((input.blocks ?? []) as LegacyBlockLine[]).map((b) => [b.id, b] as const),
  );

  const blocks = RENOVATION_BLOCKS.map((def) => migrateBlock(def, byId.get(def.id)));

  return recalculateRenovationQuote({
    clientId: input.clientId ?? null,
    clientName: input.clientName ?? "",
    clientPhone: input.clientPhone ?? "",
    address: input.address ?? "",
    projectName: input.projectName ?? "",
    deadline: input.deadline ?? "",
    blocks,
    total: 0,
    calculatedAt: input.calculatedAt ?? null,
  });
}

export function enabledRenovationItems(quote: RenovationQuoteSnapshot): {
  blockId: string;
  item: RenovationItemLine;
}[] {
  const out: { blockId: string; item: RenovationItemLine }[] = [];
  for (const block of quote.blocks) {
    for (const item of block.items) {
      if (item.enabled) out.push({ blockId: block.id, item });
    }
  }
  return out;
}

export function blockSubtotal(block: RenovationBlockLine): number {
  return block.items
    .filter((i) => i.enabled)
    .reduce((sum, i) => sum + Math.max(0, Number(i.price) || 0), 0);
}

export function recalculateRenovationQuote(
  quote: RenovationQuoteSnapshot,
): RenovationQuoteSnapshot {
  const total = quote.blocks.reduce((sum, b) => sum + blockSubtotal(b), 0);
  return {
    ...quote,
    total,
    calculatedAt: new Date().toISOString(),
  };
}

export type RenovationProposalItem = {
  id: string;
  label: string;
  comment: string;
  price: number;
};

export type RenovationProposalBlock = {
  id: string;
  section: RenovationSectionKey;
  title: string;
  items: RenovationProposalItem[];
  subtotal: number;
};

export type RenovationProposalDocument = {
  sections: {
    key: RenovationSectionKey;
    title: string;
    blocks: RenovationProposalBlock[];
    subtotal: number;
  }[];
  stages: string[];
  total: number;
};

export function buildRenovationProposalDocument(
  quote: RenovationQuoteSnapshot,
): RenovationProposalDocument {
  const normalized = normalizeRenovationQuote(quote);
  const bySection = new Map<RenovationSectionKey, RenovationProposalBlock[]>();

  for (const block of normalized.blocks) {
    const def = getRenovationBlock(block.id);
    if (!def) continue;
    const items: RenovationProposalItem[] = block.items
      .filter((i) => i.enabled)
      .map((i) => {
        const label = def.items.find((d) => d.id === i.id)?.label ?? i.id;
        return {
          id: i.id,
          label,
          comment: i.comment,
          price: i.price,
        };
      });
    if (items.length === 0) continue;
    const list = bySection.get(def.section) ?? [];
    list.push({
      id: def.id,
      section: def.section,
      title: def.title,
      items,
      subtotal: items.reduce((s, i) => s + i.price, 0),
    });
    bySection.set(def.section, list);
  }

  const sectionOrder: RenovationSectionKey[] = ["interior", "house"];
  const sections = sectionOrder
    .map((key) => {
      const blocks = bySection.get(key) ?? [];
      return {
        key,
        title: RENOVATION_SECTION_LABELS[key],
        blocks,
        subtotal: blocks.reduce((s, b) => s + b.subtotal, 0),
      };
    })
    .filter((s) => s.blocks.length > 0);

  return {
    sections,
    stages: RENOVATION_WORK_STAGES,
    total: normalized.total,
  };
}

export function renovationQuoteToProposalItems(
  quote: RenovationQuoteSnapshot,
): { name: string; qty: number; specs: string; price: number }[] {
  const doc = buildRenovationProposalDocument(quote);
  return doc.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.items.map((item) => ({
        name: `${block.title}: ${item.label}`,
        qty: 1,
        specs: item.comment,
        price: item.price,
      })),
    ),
  );
}
