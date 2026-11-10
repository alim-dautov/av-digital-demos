"use client";
import { Send } from "lucide-react";
import { Button } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { postInventoryAction } from "@/modules/inventory/actions";

export function PostInventory({ id }: { id: number }) {
  const { pending, run } = useRun();
  return <Button variant="accent" icon={<Send className="size-4" />} loading={pending} onClick={() => run(() => postInventoryAction({ id }), { success: "Проведена, остатки скорректированы" })}>Провести</Button>;
}
