"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, LogIn, User } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { changePasswordAction, loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Логин">
        <Input name="login" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required icon={<User />} placeholder="например, sales2" autoFocus />
      </Field>
      <Field label="Пароль">
        <div className="relative">
          <Input name="password" type={show ? "text" : "password"} autoComplete="current-password" required icon={<KeyRound />} className="pr-11" />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:text-ink" aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {state?.error && <p role="alert" className="animate-in rounded-xl bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger">{state.error}</p>}
      <Button type="submit" variant="accent" size="lg" loading={pending} icon={<LogIn className="size-4" />} className="mt-1">Войти</Button>
    </form>
  );
}

export function ChangePasswordForm({ needCurrent }: { needCurrent: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {needCurrent && <Field label="Текущий пароль"><Input name="current" type="password" autoComplete="current-password" required /></Field>}
      <Field label="Новый пароль" hint="Минимум 8 символов. Не используйте временный пароль.">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      </Field>
      <Field label="Повторите пароль"><Input name="repeat" type="password" autoComplete="new-password" minLength={8} required /></Field>
      {state?.error && <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger">{state.error}</p>}
      <Button type="submit" variant="accent" size="lg" loading={pending}>Сохранить и продолжить</Button>
    </form>
  );
}
