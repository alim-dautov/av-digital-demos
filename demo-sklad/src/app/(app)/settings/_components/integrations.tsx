"use client";
import { useState } from "react";
import { Ban, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Permissions } from "@/lib/rbac";
import { Button, Checkbox, Field, Input, Modal, Select } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { createTokenAction, revokeTokenAction } from "@/modules/users/actions";
import { deleteWebhookAction, saveWebhookAction, testWebhookAction } from "@/modules/webhooks/actions";
import { PermMatrix } from "./perm-matrix";
import { SecretModal } from "./users-tools";

export function TokenButton() {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", expiresInDays: 365 as number | null, permissions: { modules: { products: "view", stock: "view", orders: "view", counterparties: "view" }, flags: {} } as Permissions });
  const { pending, run } = useRun();
  return (
    <>
      <Button variant="accent" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Токен</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый API-токен" size="lg"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="accent" loading={pending} disabled={!f.name.trim()} onClick={() => run(() => createTokenAction(f), { onOk: (r) => { setOpen(false); setSecret(r.token); } })}>Создать</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" hint="например «1С», «Сайт», «Claude MCP»"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
            <Field label="Срок действия">
              <Select value={f.expiresInDays ?? 0} onChange={(e) => setF({ ...f, expiresInDays: Number(e.target.value) || null })}>
                <option value={30}>30 дней</option><option value={90}>90 дней</option><option value={365}>1 год</option><option value={0}>Бессрочно</option>
              </Select>
            </Field>
          </div>
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-2">Токен действует от вашего имени, но только в пределах отмеченных прав. Используется для REST API (<code>/api/v1</code>) и MCP-сервера (<code>/api/mcp</code>): заголовок <code>Authorization: Bearer …</code>.</p>
          <PermMatrix value={f.permissions} onChange={(permissions) => setF({ ...f, permissions })} />
        </div>
      </Modal>
      {secret && <SecretModal title="Токен создан" secret={secret} text="Скопируйте токен сейчас — в базе хранится только его хэш." onClose={() => setSecret(null)} />}
    </>
  );
}

export function RevokeToken({ id, name }: { id: number; name: string }) {
  const { pending, run } = useRun();
  return <Button variant="ghost" size="sm" loading={pending} icon={<Ban className="size-4" />} onClick={() => confirm(`Отозвать токен «${name}»? Интеграции с ним перестанут работать.`) && run(() => revokeTokenAction({ id }), { success: "Токен отозван" })}>Отозвать</Button>;
}

type WH = { id: number; name: string; url: string; events: string[]; active: boolean };
export function WebhookButton({ hook, events }: { hook?: WH; events: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [f, setF] = useState({ name: hook?.name ?? "", url: hook?.url ?? "https://", events: hook?.events ?? ["order.created"], active: hook?.active ?? true });
  const { pending, run } = useRun();
  const toggle = (e: string, v: boolean) => setF({ ...f, events: v ? [...f.events, e] : f.events.filter((x) => x !== e) });
  return (
    <>
      {hook ? <Button variant="ghost" size="icon-sm" aria-label={`Изменить ${hook.name}`} onClick={() => setOpen(true)}><Pencil className="size-4" /></Button>
        : <Button variant="accent" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Вебхук</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title={hook ? "Вебхук" : "Новый вебхук"}
        footer={<Button variant="accent" loading={pending} disabled={!f.name || !f.events.length} onClick={() => run(() => saveWebhookAction({ id: hook?.id, ...f } as never), { onOk: (r: { secret: string | null }) => { setOpen(false); if (r.secret) setSecret(r.secret); else toast.success("Сохранено"); } })}>Сохранить</Button>}>
        <div className="flex flex-col gap-3">
          <Field label="Название"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="URL" hint="POST с JSON; подпись в заголовке X-DEMO-Signature (HMAC-SHA256 от «timestamp.body»)"><Input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
          <div><p className="mb-1 text-sm font-semibold">События</p>
            <div className="grid sm:grid-cols-2">{Object.entries(events).map(([k, v]) => <Checkbox key={k} label={v} checked={f.events.includes(k)} onChange={(x) => toggle(k, x)} />)}</div>
          </div>
          <Checkbox label="Активен" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        </div>
      </Modal>
      {secret && <SecretModal title="Вебхук создан" secret={secret} text="Секрет для проверки подписи. Сохраните его на принимающей стороне." onClose={() => setSecret(null)} />}
    </>
  );
}

export function WebhookActions({ id, name }: { id: number; name: string }) {
  const { pending, run } = useRun();
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Проверить" loading={pending} onClick={() => run(() => testWebhookAction({ id }), { success: (s) => (s ? `Ответ сервера: ${s}` : "Сервер не ответил") })}><Send className="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Удалить ${name}`} onClick={() => confirm(`Удалить вебхук «${name}»?`) && run(() => deleteWebhookAction({ id }), { success: "Удалено" })}><Trash2 className="size-4" /></Button>
    </>
  );
}
