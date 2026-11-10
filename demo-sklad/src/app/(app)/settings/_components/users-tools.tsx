"use client";
import { useState } from "react";
import { Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Permissions } from "@/lib/rbac";
import { Button, Checkbox, Field, Input, Modal, MoneyInput } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { createUserAction, deleteUserAction, resetPasswordAction, updateUserAction } from "@/modules/users/actions";
import { PermMatrix } from "./perm-matrix";

export type UserRow = {
  id: number; login: string; name: string; position: string; phone: string | null; isOwner: boolean; isSalesManager: boolean; isAssembler: boolean;
  active: boolean; permissions: Permissions; weeklyPlan: number; color: string;
};

const COLORS = ["#0B2B54", "#7C3AED", "#0EA5E9", "#16A34A", "#F59E0B", "#DC2626", "#DB2777", "#0D9488"];

/** Показ временного пароля один раз */
export function SecretModal({ title, secret, text, onClose }: { title: string; secret: string; text: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={title} size="sm" footer={<Button variant="accent" onClick={onClose}>Готово</Button>}>
      <p className="mb-3 text-sm text-ink-2">{text}</p>
      <div className="flex items-center gap-2 rounded-xl border border-yellow bg-yellow/10 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-[15px] font-bold">{secret}</code>
        <Button variant="ghost" size="icon-sm" aria-label="Скопировать" onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success("Скопировано"))}><Copy className="size-4" /></Button>
      </div>
      <p className="mt-3 text-xs text-ink-3">После закрытия окна значение больше не будет показано.</p>
    </Modal>
  );
}

export function UserButton({ user }: { user?: UserRow }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ login: string; pw: string } | null>(null);
  return (
    <>
      {user
        ? <Button variant="ghost" size="icon-sm" aria-label={`Изменить ${user.name}`} onClick={() => setOpen(true)}><Pencil className="size-4" /></Button>
        : <Button variant="accent" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Сотрудник</Button>}
      {open && <UserModal user={user} onClose={() => setOpen(false)} onCreated={(login, pw) => setSecret({ login, pw })} />}
      {secret && <SecretModal title="Сотрудник создан" secret={secret.pw} text={`Логин: ${secret.login}. Временный пароль — передайте сотруднику, при первом входе он задаст свой.`} onClose={() => setSecret(null)} />}
    </>
  );
}

function UserModal({ user, onClose, onCreated }: { user?: UserRow; onClose: () => void; onCreated: (login: string, pw: string) => void }) {
  const [f, setF] = useState({
    login: user?.login ?? "", name: user?.name ?? "", position: user?.position ?? "", phone: user?.phone ?? "", isSalesManager: user?.isSalesManager ?? false,
    isAssembler: user?.isAssembler ?? false, active: user?.active ?? true, weeklyPlan: user?.weeklyPlan ?? 0, color: user?.color ?? COLORS[1],
    permissions: user?.permissions ?? ({ modules: {}, flags: { seeOwnEarnings: true } } as Permissions),
  });
  const { pending, run } = useRun();
  const owner = user?.isOwner;
  const save = () => {
    const data = { ...f, phone: f.phone || null };
    if (user) run(() => updateUserAction({ id: user.id, data }), { success: "Сохранено", onOk: onClose });
    else run(() => createUserAction(data), { onOk: (r) => { onClose(); onCreated(f.login.toLowerCase(), r.tempPassword); } });
  };
  return (
    <Modal open onClose={onClose} title={user ? user.name : "Новый сотрудник"} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button variant="accent" loading={pending} disabled={!f.login || !f.name} onClick={save}>{user ? "Сохранить" : "Создать"}</Button></>}>
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Имя" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Логин" required hint="латиница, цифры, . _ -"><Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.trim() })} autoCapitalize="off" autoComplete="off" /></Field>
          <Field label="Должность"><Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
          <Field label="Телефон"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+7 7__ ___ __ __" /></Field>
          <Field label="План продаж на неделю" hint="для менеджеров"><MoneyInput value={f.weeklyPlan} onChange={(v) => setF({ ...f, weeklyPlan: v })} /></Field>
          <Field label="Цвет">
            <div className="flex flex-wrap gap-1.5">{COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setF({ ...f, color: c })} className="size-9 rounded-full border-2" style={{ background: c, borderColor: f.color === c ? "var(--yellow)" : "transparent" }} />)}</div>
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox label="Менеджер по продажам" checked={f.isSalesManager} onChange={(v) => setF({ ...f, isSalesManager: v })} />
          <Checkbox label="Сборщик" checked={f.isAssembler} onChange={(v) => setF({ ...f, isAssembler: v })} />
          {!owner && <Checkbox label="Активен (может входить)" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        </div>
        {owner ? <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">Владелец имеет полный доступ ко всем модулям — матрица прав не применяется.</p> : (
          <div><h3 className="mb-2 text-sm font-bold">Права доступа</h3><PermMatrix value={f.permissions} onChange={(permissions) => setF({ ...f, permissions })} /></div>
        )}
      </div>
    </Modal>
  );
}

export function ResetPassword({ id, name }: { id: number; name: string }) {
  const { pending, run } = useRun();
  const [pw, setPw] = useState<string | null>(null);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Сбросить пароль ${name}`} loading={pending}
        onClick={() => confirm(`Сбросить пароль сотрудника ${name}? Все его сессии будут завершены.`) && run(() => resetPasswordAction({ id }), { onOk: setPw })}><KeyRound className="size-4" /></Button>
      {pw && <SecretModal title="Новый временный пароль" secret={pw} text={`${name} должен войти с этим паролем и задать свой.`} onClose={() => setPw(null)} />}
    </>
  );
}

export function DeleteUser({ id, name }: { id: number; name: string }) {
  const { pending, run } = useRun();
  return <Button variant="ghost" size="icon-sm" aria-label={`Удалить ${name}`} loading={pending}
    onClick={() => confirm(`Удалить сотрудника ${name}? История и документы сохранятся.`) && run(() => deleteUserAction({ id }), { success: "Сотрудник удалён" })}><Trash2 className="size-4" /></Button>;
}
