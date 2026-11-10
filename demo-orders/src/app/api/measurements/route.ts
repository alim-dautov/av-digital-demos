import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import {
  createMeasurement,
  deleteMeasurement,
  listMeasurements,
  MeasurementConflictError,
  updateMeasurement,
} from "@/lib/services/measurements";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const baseSchema = z.object({
  clientId: z.string().min(1),
  orderId: z.string().nullable().optional(),
  measurerId: z.string().min(1),
  date: z.string().regex(dateRe),
  startTime: z.string().regex(timeRe),
  durationMin: z.number().int().min(15).max(600),
  address: z.string().max(300).optional(),
  status: z.enum(["planned", "done", "cancelled"]).optional(),
  comment: z.string().max(1000).nullable().optional(),
});

const patchSchema = baseSchema.partial().extend({ id: z.string().min(1) });

async function authorize(action: "read" | "write") {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!can(session, "calendar", action)) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { session };
}

function failure(e: unknown) {
  const status = e instanceof MeasurementConflictError ? 409 : 400;
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Ошибка" },
    { status },
  );
}

export async function GET(req: Request) {
  const { session, error } = await authorize("read");
  if (error) return error;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = from && to && dateRe.test(from) && dateRe.test(to) ? { from, to } : undefined;
  return NextResponse.json({ measurements: listMeasurements(session.companyId, range) });
}

export async function POST(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const parsed = baseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, measurement: createMeasurement(session.companyId, parsed.data) });
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  try {
    return NextResponse.json({ ok: true, measurement: updateMeasurement(session.companyId, id, patch) });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан замер" }, { status: 400 });
  deleteMeasurement(session.companyId, id);
  return NextResponse.json({ ok: true });
}
