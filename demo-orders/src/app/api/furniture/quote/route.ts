import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isFurnitureCompany } from "@/lib/company";
import { recalculateFurnitureQuote } from "@/lib/domain/furniture/quote";
import { listFurniturePrices } from "@/lib/services/furniture-catalog";
import {
  createFurnitureProposal,
  saveFurnitureDraft,
} from "@/lib/services/furniture-orders";
import type { FurnitureQuoteSnapshot } from "@/types";

const moduleSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["base", "wall", "mezzanine", "tall"]),
  variant: z.enum(["doors", "drawers2", "drawers3"]),
  width: z.number().positive().max(3000),
  height: z.number().positive().max(3000),
  depth: z.number().positive().max(1000),
  quantity: z.number().int().min(1).max(100),
  price: z.number().min(0).max(1_000_000_000).nullable().optional(),
  x: z.number().min(0).max(50_000).nullable().optional(),
});

const roomSchema = z.object({
  length: z.number().min(500).max(50_000),
  height: z.number().min(1500).max(6000),
  depth: z.number().min(500).max(50_000),
});

const bodySchema = z.object({
  orderId: z.string().optional().nullable(),
  action: z.enum(["calculate", "draft", "proposal"]).default("calculate"),
  quote: z
    .object({
      modules: z.array(moduleSchema).max(200),
      calculationMode: z.enum(["quick", "detailed"]).optional(),
      quickEstimate: z
        .object({
          linearMeters: z.number().min(0).max(1_000),
          heightMeters: z.number().min(0).max(10),
          tariff: z.enum(["ldsp_budget", "ldsp_standard", "mdf_paint"]),
        })
        .optional(),
      clientName: z.string().max(200),
      clientPhone: z.string().max(50),
      room: roomSchema.optional(),
      facadeColor: z.string().max(40).optional(),
      carcassColor: z.string().max(40).optional(),
    })
    .passthrough(),
});

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "calculator", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isFurnitureCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  try {
    const input = parsed.data.quote as unknown as FurnitureQuoteSnapshot;
    if (parsed.data.action === "calculate") {
      const quote = recalculateFurnitureQuote(input, listFurniturePrices(session.companyId));
      return NextResponse.json({ ok: true, quote });
    }

    const actor = { id: session.id, name: session.fullName };
    const order = saveFurnitureDraft(
      session.companyId,
      { orderId: parsed.data.orderId, quote: input },
      actor,
    );

    if (parsed.data.action === "proposal") {
      const proposal = createFurnitureProposal(session.companyId, order.id, actor);
      return NextResponse.json({
        ok: true,
        quote: order.furnitureQuote,
        order,
        proposal,
        pdfUrl: `/api/calculator/proposal/${proposal.id}/pdf`,
      });
    }

    return NextResponse.json({ ok: true, quote: order.furnitureQuote, order });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 },
    );
  }
}
