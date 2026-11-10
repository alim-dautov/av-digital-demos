import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/api";
import { ProductionOrderError, updateProductionData } from "@/lib/services/production-order";

const textileChangeSchema = z.object({
  roomId: z.string().trim().min(1).max(100),
  collection: z.enum(["tulle", "portiere", "covers", "pillows", "cornices", "rollers"]),
  lineId: z.string().trim().min(1).max(100),
  field: z.string().trim().min(1).max(40),
  value: z.union([z.string().max(500), z.number().finite().min(0), z.boolean(), z.null()]),
});

const operationalChangeSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("stage"),
    id: z.string().trim().min(1).max(100),
    field: z.enum(["status", "comment"]),
    value: z.union([z.string().max(500), z.null()]),
  }),
  z.object({
    target: z.literal("checklist"),
    id: z.string().trim().min(1).max(100),
    field: z.enum(["done", "quantity", "comment"]),
    value: z.union([z.string().max(500), z.number().finite().min(0), z.boolean(), z.null()]),
  }),
  z.object({
    target: z.literal("order"),
    field: z.literal("productionComment"),
    value: z.union([z.string().max(2000), z.null()]),
  }),
  z.object({
    target: z.literal("materials"),
    field: z.literal("list"),
    value: z.string().max(20000),
  }),
]);

const schema = z.object({
  changes: z.array(z.union([textileChangeSchema, operationalChangeSchema])).min(1).max(100),
  expectedUpdatedAt: z.string().datetime().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "workshop", "write") && !can(session, "production", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const { data, error } = await parseJson(request, schema, "Некорректные производственные данные");
  if (error) return error;
  try {
    const { id } = await ctx.params;
    const result = updateProductionData(
      session.companyId,
      id,
      data.changes,
      { id: session.id, name: session.fullName },
      data.expectedUpdatedAt,
      data.reason,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ProductionOrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Не удалось сохранить изменения" }, { status: 500 });
  }
}
