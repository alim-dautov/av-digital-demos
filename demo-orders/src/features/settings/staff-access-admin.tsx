"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, Plus, Save, ShieldCheck } from "lucide-react";
import {
  DEPARTMENTS,
  RESOURCE_LABELS,
  roleDefaultLevel,
  type Resource,
} from "@/lib/rbac";
import type { StaffUser } from "@/lib/services/staff-access";
import { ROLE_LABELS, type AccessLevel, type UserRole } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "none", label: "Нет" },
  { value: "read", label: "Просмотр" },
  { value: "write", label: "Редактирование" },
];

type Props = {
  initialUsers: StaffUser[];
  assignableRoles: UserRole[];
  currentUserId: string;
  isOwner: boolean;
};

type Levels = Partial<Record<Resource, AccessLevel>>;

function levelsFor(user: StaffUser): Levels {
  const levels: Levels = {};
  for (const dept of DEPARTMENTS) {
    for (const r of dept.resources) {
      levels[r] = (user.access[r] as AccessLevel | undefined) ?? roleDefaultLevel(user.role, r);
    }
  }
  return levels;
}

async function request<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? "Не удалось сохранить");
  return json;
}

export function StaffAccessAdmin({ initialUsers, assignableRoles, currentUserId, isOwner }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [selectedId, setSelectedId] = useState<string>(
    initialUsers.find((u) => u.id !== currentUserId)?.id ?? initialUsers[0]?.id ?? "",
  );
  const selected = users.find((u) => u.id === selectedId) ?? null;
  const [levels, setLevels] = useState<Levels>(() => (selected ? levelsFor(selected) : {}));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    fullName: "",
    login: "",
    password: "",
    role: "SEAMSTRESS" as UserRole,
    position: "",
  });

  const roles = useMemo(
    () => (isOwner ? (["OWNER", ...assignableRoles] as UserRole[]) : assignableRoles),
    [assignableRoles, isOwner],
  );
  const isSelf = selected?.id === currentUserId;
  const locked = !selected || isSelf || !selected.restrictable;

  function select(id: string) {
    const user = users.find((u) => u.id === id);
    setSelectedId(id);
    setLevels(user ? levelsFor(user) : {});
    setPassword("");
  }

  function replaceUser(user: StaffUser) {
    setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
    if (user.id === selectedId) setLevels(levelsFor(user));
  }

  async function patchUser(body: Record<string, unknown>, okMessage: string, key: string) {
    if (!selected) return;
    setBusy(key);
    try {
      const { user } = await request<{ user: StaffUser }>(
        `/api/settings/users/${selected.id}`,
        "PATCH",
        body,
      );
      replaceUser(user);
      toast.success(okMessage);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  }

  function setDepartment(resources: Resource[], on: boolean) {
    setLevels((prev) => {
      const next = { ...prev };
      for (const r of resources) next[r] = on ? "write" : "none";
      return next;
    });
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    try {
      const { user } = await request<{ user: StaffUser }>("/api/settings/users", "POST", {
        ...draft,
        position: draft.position || null,
      });
      setUsers((prev) =>
        [...prev, user].sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")),
      );
      select(user.id);
      setLevels(levelsFor(user));
      setCreating(false);
      setDraft({ fullName: "", login: "", password: "", role: "SEAMSTRESS", position: "" });
      toast.success(`Сотрудник создан. Логин: ${user.login}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Сотрудники и доступ</CardTitle>
          <CardDescription>
            Выберите сотрудника, включите нужные отделы и модули и сохраните. Изменения действуют
            со следующего открытия страницы или запроса.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" />
          Новый сотрудник
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {creating && (
          <form
            onSubmit={createUser}
            className="grid gap-3 rounded-lg border border-border bg-panel-elevated p-4 sm:grid-cols-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Имя и фамилия</Label>
              <Input
                id="new-name"
                required
                maxLength={100}
                value={draft.fullName}
                onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-position">Должность</Label>
              <Input
                id="new-position"
                maxLength={100}
                value={draft.position}
                onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-login">Логин</Label>
              <Input
                id="new-login"
                required
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                pattern="[a-z0-9][a-z0-9._\-]{2,31}"
                title="3–32 символа: латиница, цифры, точка, дефис, подчёркивание"
                value={draft.login}
                onChange={(e) => setDraft((d) => ({ ...d, login: e.target.value.toLowerCase() }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Пароль</Label>
              <Input
                id="new-password"
                required
                minLength={8}
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Роль</Label>
              <Select
                value={draft.role}
                onValueChange={(v) => setDraft((d) => ({ ...d, role: v as UserRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={busy === "create"}>
                {busy === "create" && <Loader2 className="size-4 animate-spin" />}
                Создать
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Отмена
              </Button>
            </div>
          </form>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <ul className="space-y-1" aria-label="Сотрудники">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => select(u.id)}
                  aria-current={u.id === selectedId ? "true" : undefined}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    u.id === selectedId
                      ? "border-primary/50 bg-primary/10"
                      : "border-transparent hover:bg-foreground/[0.04]",
                  )}
                >
                  <span className="block truncate text-sm font-medium">{u.fullName}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {u.position || ROLE_LABELS[u.role]}
                    {u.login && <span className="font-mono">{u.login}</span>}
                    {!u.isActive && <Badge variant="secondary">отключён</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="min-w-0 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Роль</Label>
                  <Select
                    value={selected.role}
                    disabled={isSelf || (selected.role === "OWNER" && !isOwner)}
                    onValueChange={(v) =>
                      void patchUser({ role: v }, "Роль изменена", "role")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(roles.includes(selected.role) ? roles : [selected.role, ...roles]).map(
                        (r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Учётная запись активна</p>
                    <p className="text-xs text-muted-foreground">
                      Отключённый сотрудник не сможет войти
                    </p>
                  </div>
                  <Switch
                    checked={selected.isActive}
                    disabled={isSelf || busy === "active"}
                    onCheckedChange={(v) =>
                      void patchUser(
                        { isActive: v },
                        v ? "Учётная запись включена" : "Учётная запись отключена",
                        "active",
                      )
                    }
                    aria-label="Учётная запись активна"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Удаление заказов</p>
                    <p className="text-xs text-muted-foreground">
                      {selected.role === "OWNER"
                        ? "Владелец удаляет заказы всегда"
                        : selected.role === "DIRECTOR" || selected.role === "ADMIN"
                          ? "Директор и администратор удаляют заказы, пока владелец не отключит"
                          : "Эта роль заказы не удаляет"}
                    </p>
                  </div>
                  <Switch
                    checked={selected.deleteOrders}
                    disabled={
                      isSelf ||
                      !(selected.role === "DIRECTOR" || selected.role === "ADMIN") ||
                      busy === "delete-orders"
                    }
                    onCheckedChange={(v) =>
                      void patchUser(
                        { deleteOrders: v },
                        v ? "Удаление заказов разрешено" : "Удаление заказов запрещено",
                        "delete-orders",
                      )
                    }
                    aria-label="Удаление заказов"
                  />
                </div>
                <form
                  className="flex items-end gap-2 sm:col-span-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void patchUser({ password }, "Пароль изменён", "password").then(() =>
                      setPassword(""),
                    );
                  }}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="reset-password">
                      Новый пароль{selected.login ? ` для «${selected.login}»` : ""}
                    </Label>
                    <Input
                      id="reset-password"
                      minLength={8}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="outline" disabled={busy === "password"}>
                    {busy === "password" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    Сменить
                  </Button>
                </form>
              </div>

              {locked ? (
                <p className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4 shrink-0" />
                  {isSelf
                    ? "Свой доступ изменить нельзя."
                    : "У владельца полный доступ ко всем модулям."}
                </p>
              ) : (
                <div className="space-y-4">
                  {DEPARTMENTS.map((dept) => {
                    const allOn = dept.resources.every((r) => levels[r] !== "none");
                    return (
                      <fieldset
                        key={dept.id}
                        className="rounded-lg border border-border"
                      >
                        <legend className="sr-only">{dept.label}</legend>
                        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                          <span className="text-sm font-semibold">{dept.label}</span>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Весь отдел
                            <Switch
                              checked={allOn}
                              onCheckedChange={(v) => setDepartment(dept.resources, v)}
                              aria-label={`Отдел «${dept.label}»`}
                            />
                          </label>
                        </div>
                        <ul className="divide-y divide-border">
                          {dept.resources.map((r) => (
                            <li
                              key={r}
                              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="text-sm">{RESOURCE_LABELS[r]}</span>
                              <div
                                role="radiogroup"
                                aria-label={RESOURCE_LABELS[r]}
                                className="inline-flex rounded-md border border-border p-0.5"
                              >
                                {LEVELS.map((l) => (
                                  <button
                                    key={l.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={levels[r] === l.value}
                                    onClick={() =>
                                      setLevels((prev) => ({ ...prev, [r]: l.value }))
                                    }
                                    className={cn(
                                      "rounded px-2.5 py-1 text-xs transition-colors",
                                      levels[r] === l.value
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    {l.label}
                                  </button>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </fieldset>
                    );
                  })}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={busy === "access"}
                      onClick={() =>
                        void patchUser({ access: levels }, "Доступ сохранён", "access")
                      }
                    >
                      {busy === "access" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Сохранить доступ
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setLevels(levelsFor({ ...selected, access: {} }))
                      }
                    >
                      По умолчанию для роли
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
