import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { MEBELDEMO_ID } from "@/lib/company";
import { createMaterial, archiveMaterials } from "@/lib/services/inventory";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum([
    "hardware",
    "sheet",
    "consumables",
    "machine",
    "fabric_portiere",
    "fabric_tulle",
  ]),
  unit: z.string().trim().min(1).max(20),
  sku: z.string().trim().max(40).optional(),
  minStock: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  attributes: z.record(z.string().max(40), z.string().max(120)).optional(),
});

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "inventory", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Укажите наименование, категорию и единицу" }, { status: 400 });
  }
  try {
    const material = createMaterial({ companyId: session.companyId, ...parsed.data });
    return NextResponse.json({ ok: true, material }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 },
    );
  }
}

const deleteSchema = z.object({ ids: z.array(z.string().trim().min(1).max(64)).min(1).max(10000) });

export async function DELETE(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (session.companyId !== MEBELDEMO_ID || !can(session, "inventory", "manage")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Выберите позиции для удаления" }, { status: 400 });
  try {
    const count = archiveMaterials(session.companyId, session, parsed.data.ids);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка удаления" }, { status: 400 });
  }
}
