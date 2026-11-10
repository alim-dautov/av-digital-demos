import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { recalculateAtelierQuote } from "@/lib/domain/atelier-calc";
import {
  createAtelierProposal,
  saveAtelierDraft,
} from "@/lib/services/atelier-orders";
import { changeAtelierStatus, sendToWorkshop, WorkshopError } from "@/lib/services/workshop";
import { ATELIER_SELECTABLE_STATUSES } from "@/types";
import type { Order, AtelierOrderStatus, AtelierStoredQuote } from "@/types";

const bodySchema = z.object({
  orderId: z.string().optional().nullable(),
  quote: z.record(z.string(), z.unknown()),
  action: z.enum(["calculate", "draft", "proposal", "workshop"]).default("calculate"),
  roomIds: z.array(z.string().min(1).max(64)).max(200).optional(),
  status: z.enum(ATELIER_SELECTABLE_STATUSES as [AtelierOrderStatus, ...AtelierOrderStatus[]]).optional(),
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
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  try {
    const quote = recalculateAtelierQuote(
      parsed.data.quote as unknown as AtelierStoredQuote,
    );

    if (parsed.data.action === "calculate") {
      return NextResponse.json({ ok: true, quote });
    }

    const actor = { id: session.id, name: session.fullName };
    let order: Order = saveAtelierDraft(
      session.companyId,
      {
        orderId: parsed.data.orderId,
        quote,
      },
      actor,
    );
    const status = parsed.data.status;
    if (status && status !== order.status) {
      if (!can(session, "orders", "write")) {
        return NextResponse.json(
          { error: "Недостаточно прав для смены статуса", quote, order },
          { status: 403 },
        );
      }
      order = await changeAtelierStatus(session.companyId, order.id, status, actor);
    }

    if (parsed.data.action === "workshop") {
      const sent = await sendToWorkshop(session.companyId, order.id, actor);
      return NextResponse.json({
        ok: true,
        quote,
        order: sent.order,
        notified: sent.notified,
        alreadySent: sent.alreadySent,
      });
    }

    if (parsed.data.action === "proposal") {
      const proposal = createAtelierProposal(
        session.companyId,
        order.id,
        actor,
        parsed.data.roomIds,
      );
      return NextResponse.json({
        ok: true,
        quote,
        order,
        proposal,
        pdfUrl: `/api/calculator/proposal/${proposal.id}/pdf`,
      });
    }

    return NextResponse.json({ ok: true, quote, order });
  } catch (e) {
    if (e instanceof WorkshopError) {
      return NextResponse.json({ error: e.message, order: e.order }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 },
    );
  }
}
