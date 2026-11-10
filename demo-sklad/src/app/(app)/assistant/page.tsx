import { requireUser } from "@/lib/auth";
import { PageHeader, Badge } from "@/components/ui";
import { getAssistant } from "@/modules/assistant/provider";
import { toolsFor } from "@/modules/assistant/tools";
import { AssistantChat } from "./chat";

export const metadata = { title: "Ассистент" };

export default async function AssistantPage() {
  const u = await requireUser("assistant");
  const a = getAssistant();
  const tools = toolsFor(u).map((t) => ({ name: t.name, title: t.title, write: !!t.write }));
  return (
    <>
      <PageHeader title="Ассистент" subtitle={<span className="inline-flex items-center gap-2">{a.name}{a.isStub && <Badge tone="info">заглушка</Badge>}</span>} />
      <AssistantChat name={u.name.split(" ")[0]} tools={tools} />
    </>
  );
}
