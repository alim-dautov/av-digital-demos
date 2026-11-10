import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { VoiceAssistantPanel } from "@/features/voice/voice-assistant-panel";

export default async function AssistantPage() {
  const session = await getSession();
  if (!session) return null;
  if (!can(session, "assistant", "read")) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Голосовой ассистент
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Спрашивайте о заказах, прибыли, опозданиях и загрузке мастеров
        </p>
      </div>
      <VoiceAssistantPanel />
    </div>
  );
}
