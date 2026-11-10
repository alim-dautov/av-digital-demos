"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { CpPicker, type CpOption } from "@/components/pickers";
import { PaymentButton } from "@/components/payment-modal";

/** Платёж без документа: выбираем контрагента, затем обычная форма оплаты */
export function NewPayment() {
  const [open, setOpen] = useState(false);
  const [cp, setCp] = useState<CpOption | null>(null);
  return (
    <>
      <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setCp(null); setOpen(true); }}>Платёж</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый платёж" size="sm">
        <div className="flex flex-col gap-4">
          <CpPicker value={cp} onChange={setCp} autoFocus />
          {cp && (
            <div className="grid grid-cols-2 gap-2">
              <PaymentButton direction="in" counterparty={cp} amount={Math.max(0, cp.clientDebt)} label="Приход от него" variant="accent" />
              <PaymentButton direction="out" counterparty={cp} label="Оплата ему" />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
