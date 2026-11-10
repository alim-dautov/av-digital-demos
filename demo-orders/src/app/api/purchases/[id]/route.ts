import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { postPurchase, updatePurchase } from "@/lib/services/purchases";
import { CATEGORY_LABELS } from "@/types";

const itemSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(Object.keys(CATEGORY_LABELS) as [string, ...string[]]),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1),
  price: z.coerce.number().min(0),
  lengthM: z.coerce.number().positive().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "purchases", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = z
    .object({
      supplier: z.string().trim().min(1).optional(),
      comment: z.string().max(1000).nullable().optional(),
      items: z.array(itemSchema).optional(),
      post: z.boolean().optional(),
    })
    .safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    if (parsed.data.items || parsed.data.supplier || parsed.data.comment !== undefined) {
      updatePurchase(session.companyId, id, {
        supplier: parsed.data.supplier,
        comment: parsed.data.comment,
        items: parsed.data.items?.map((item) => ({
          ...item,
          category: item.category as never,
          lengthM: item.lengthM ?? null,
        })),
      });
    }
    const purchase = parsed.data.post
      ? postPurchase(session.companyId, id)
      : updatePurchase(session.companyId, id, {});
    return NextResponse.json({ purchase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
