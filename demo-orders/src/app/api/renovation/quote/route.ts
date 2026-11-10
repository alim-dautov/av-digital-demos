import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isRenovationCompany } from "@/lib/company";
import { normalizeRenovationQuote } from "@/lib/domain/renovation/quote";
import {
  createRenovationProposal,
  saveRenovationDraft,
} from "@/lib/services/renovation-orders";
import type { RenovationQuoteSnapshot } from "@/types";

const itemSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  comment: z.string().max(2000),
  price: z.number().min(0).max(1_000_000_000_000),
});

const blockSchema = z.object({
  id: z.string().min(1),
  items: z.array(itemSchema).max(50),
});

const bodySchema = z.object({
  orderId: z.string().optional().nullable(),
  action: z.enum(["calculate", "draft", "proposal"]).default("calculate"),
  quote: z
    .object({
      clientName: z.string().max(200),
      clientPhone: z.string().max(50),
      address: z.string().max(500).optional(),
      projectName: z.string().max(200).optional(),
      deadline: z.string().max(40).optional(),
      clientId: z.string().nullable().optional(),
      blocks: z.array(blockSchema).max(100),
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
  if (!isRenovationCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  try {
    const input = parsed.data.quote as unknown as RenovationQuoteSnapshot;
    if (parsed.data.action === "calculate") {
      const quote = normalizeRenovationQuote(input);
      return NextResponse.json({ ok: true, quote });
    }

    const actor = { id: session.id, name: session.fullName };
    const order = saveRenovationDraft(
      session.companyId,
      { orderId: parsed.data.orderId, quote: input },
      actor,
    );

    if (parsed.data.action === "proposal") {
      const proposal = createRenovationProposal(session.companyId, order.id, actor);
      return NextResponse.json({
        ok: true,
        quote: order.renovationQuote,
        order,
        proposal,
        pdfUrl: `/api/calculator/proposal/${proposal.id}/pdf`,
      });
    }

    return NextResponse.json({ ok: true, quote: order.renovationQuote, order });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
