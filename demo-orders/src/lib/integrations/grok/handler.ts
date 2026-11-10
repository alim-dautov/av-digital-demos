import { z } from "zod";
import { getData } from "@/lib/db";
import { logActivity } from "@/lib/services/activity";
import { createNotification } from "@/lib/services/notifications";
import type { GrokConnectorMode, GrokLogOutcome, SessionUser } from "@/types";
import { resolveActor } from "./access";
import { getGrokCommand } from "./commands";
import { GrokCommandError } from "./errors";
import { recordGrokLog } from "./log";
import { getGrokSettings } from "./settings";

export const grokRequestSchema = z.object({
  actorUserId: z.string().trim().min(1).max(64),
  companyId: z.string().trim().min(1).max(64).optional(),
  command: z.string().trim().min(1).max(64),
  args: z.unknown().optional(),
  confirm: z.boolean().optional(),
  requestId: z.string().trim().min(1).max(100).optional(),
});

export type GrokRequest = z.infer<typeof grokRequestSchema>;

export type GrokResponse = {
  ok: boolean;
  mode: GrokConnectorMode | null;
  command: string;
  requestId: string | null;
  message?: string;
  data?: unknown;
  error?: string;
  confirmationRequired?: boolean;
};

export type GrokResult = { status: number; body: GrokResponse };

type Trace = {
  command: string;
  requestId: string | null;
  ip: string | null;
  companyId: string | null;
  actor: SessionUser | null;
  mode: GrokConnectorMode | null;
};

function finish(trace: Trace, status: number, outcome: GrokLogOutcome, body: Omit<GrokResponse, "mode" | "command" | "requestId">): GrokResult {
  recordGrokLog({
    companyId: trace.companyId,
    requestId: trace.requestId,
    actorUserId: trace.actor?.id ?? null,
    actorName: trace.actor?.fullName ?? null,
    command: trace.command,
    mode: trace.mode,
    outcome,
    status,
    message: body.error ?? body.message ?? "",
    ip: trace.ip,
  });
  return {
    status,
    body: { ...body, mode: trace.mode, command: trace.command, requestId: trace.requestId },
  };
}

/** Logs a request rejected before the body was read (bad token, rate limit). */
export function rejectGrokRequest(status: number, error: string, ip: string | null): GrokResult {
  return finish(
    { command: "-", requestId: null, ip, companyId: null, actor: null, mode: null },
    status,
    "error",
    { ok: false, error },
  );
}

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Некорректные параметры";
  const path = issue.path.join(".");
  return path ? `Некорректный параметр ${path}: ${issue.message}` : issue.message;
}

/** Runs one connector command on behalf of a user. The caller has already authenticated the integration. */
export async function handleGrokRequest(input: unknown, ip: string | null = null): Promise<GrokResult> {
  const parsed = grokRequestSchema.safeParse(input);
  const trace: Trace = {
    command: parsed.success ? parsed.data.command : "-",
    requestId: parsed.success ? (parsed.data.requestId ?? null) : null,
    ip,
    companyId: null,
    actor: null,
    mode: null,
  };
  if (!parsed.success) {
    return finish(trace, 400, "error", { ok: false, error: zodMessage(parsed.error) });
  }
  const req = parsed.data;

  try {
    const data = getData();
    const actor = resolveActor(data, req.actorUserId, req.companyId);
    trace.actor = actor;
    trace.companyId = actor.companyId;

    const settings = getGrokSettings(actor.companyId, data);
    trace.mode = settings.mode;
    if (!settings.enabled) throw new GrokCommandError("Интеграция выключена в настройках", 403);
    if (!settings.allowedUserIds.includes(actor.id)) {
      throw new GrokCommandError("Пользователю не разрешено работать через Grok", 403, "denied");
    }

    const command = getGrokCommand(req.command);
    if (!command) throw new GrokCommandError("Неизвестная команда", 404, "denied");
    if (command.kind === "critical") {
      throw new GrokCommandError("Операция выполняется только в CRM", 403, "denied");
    }
    if (!settings.allowedCommands.includes(command.name)) {
      throw new GrokCommandError("Команда не разрешена в настройках интеграции", 403, "denied");
    }
    if (!command.allowed(actor)) throw new GrokCommandError("Недостаточно прав", 403, "denied");

    const args = command.args.safeParse(req.args ?? {});
    if (!args.success) throw new GrokCommandError(zodMessage(args.error), 400, "denied");
    const ctx = { actor, data, args: args.data };

    if (command.kind === "read" && command.run) {
      return finish(trace, 200, "ok", { ok: true, data: command.run(ctx) });
    }

    const prepared = command.prepare!(ctx);
    if (settings.mode === "test") {
      return finish(trace, 200, "preview", {
        ok: true,
        message: `Тестовый режим, данные не изменены. ${prepared.preview}`,
        data: { preview: prepared.data ?? null },
      });
    }
    if (!req.confirm) {
      return finish(trace, 409, "confirmation_required", {
        ok: false,
        confirmationRequired: true,
        message: `${prepared.preview}. Повторите запрос с confirm: true`,
        data: { preview: prepared.data ?? null },
      });
    }

    const done = await prepared.execute();
    logActivity({
      companyId: actor.companyId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: `Через Grok: ${command.label.toLowerCase()}. ${done.message}`,
      entityType: done.entityType,
      entityId: done.entityId,
    });
    await createNotification({
      companyId: actor.companyId,
      userId: actor.id,
      type: "assistant",
      title: "Grok выполнил действие",
      body: done.message,
    });
    return finish(trace, 200, "ok", { ok: true, message: done.message, data: done.data });
  } catch (error) {
    if (error instanceof GrokCommandError) {
      return finish(trace, error.status, error.outcome, { ok: false, error: error.message });
    }
    console.error("[grok-connector]", error);
    return finish(trace, 500, "error", { ok: false, error: "Внутренняя ошибка коннектора" });
  }
}
