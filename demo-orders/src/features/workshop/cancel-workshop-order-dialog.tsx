"use client";

import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  order: { id: string; number: string; acceptedBy: { name: string } | null } | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (orderId: string) => void;
};

export function CancelWorkshopOrderDialog({ order, busy, onOpenChange, onConfirm }: Props) {
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить заказ №{order?.number}?</DialogTitle>
          <DialogDescription>
            Заказ уйдёт из очереди цеха, швеи получат уведомление об отмене.
            {order?.acceptedBy ? ` Заказ уже в работе у: ${order.acceptedBy.name}.` : ""} Заказ не
            удаляется, его можно найти в списке заказов со статусом «Отменён».
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="lg"
            className="touch-manipulation min-h-12"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Не отменять
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="touch-manipulation min-h-12"
            disabled={busy || !order}
            onClick={() => order && onConfirm(order.id)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            Отменить заказ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
