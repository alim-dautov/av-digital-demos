"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalRoomsDialog } from "@/features/atelier-calculator/proposal-rooms-dialog";
import type { AtelierStoredQuote } from "@/types";

export function ClientCalcActions({
  orderId,
  orderNumber,
  sent,
  canSend,
  quote,
  sewingRoomIds,
}: {
  orderId: string;
  orderNumber: string;
  sent: boolean;
  canSend: boolean;
  quote: AtelierStoredQuote;
  sewingRoomIds?: string[] | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [sentIds, setSentIds] = useState<string[] | null>(sewingRoomIds ?? null);

  async function sendToWorkshop(roomIds: string[]) {
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/sewing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось передать в цех");
      setSentIds(roomIds);
      setOpen(false);
      toast.success(sent ? "Комнаты в цехе обновлены" : "Заказ передан в цех");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" asChild>
        <Link href={`/orders/${orderNumber}/measure`}>Лист замера</Link>
      </Button>
      {canSend ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
          {sent || sentIds?.length ? "Комнаты в цех" : "Заказ в цех на пошив"}
        </Button>
      ) : null}
      <ProposalRoomsDialog
        open={open}
        onOpenChange={setOpen}
        quote={quote}
        pending={pending}
        initialSelected={sentIds}
        sentIds={sentIds}
        title="Комнаты в цех"
        description="В заказ на пошив попадут только отмеченные комнаты. Остальные можно передать позже."
        confirmLabel="Передать в цех"
        totalLabel="Итого по выбранным"
        onConfirm={(roomIds) => void sendToWorkshop(roomIds)}
      />
    </div>
  );
}
