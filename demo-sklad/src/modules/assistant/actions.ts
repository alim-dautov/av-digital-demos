"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getAssistant } from "./provider";

const msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) });

export const askAssistantAction = action(z.object({ messages: z.array(msg).min(1).max(40) }), async (i, { db, p }) => {
  assertCan(p, "assistant");
  const r = await getAssistant().reply(db, p, i.messages);
  if (r.toolCalls.some((c) => c.ok && ["create_task", "create_lead"].includes(c.name))) await audit(db, p, "create", "assistant", null, `Ассистент: ${r.toolCalls.map((c) => c.title).join(", ")}`);
  return { text: r.text, tools: r.toolCalls.map((c) => ({ title: c.title, ok: c.ok })) };
});
