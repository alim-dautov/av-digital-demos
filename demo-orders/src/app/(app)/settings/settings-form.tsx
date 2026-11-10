"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import type { Company, CompanySettings, UserAccount, UserRole } from "@/types";
import {
  ORDER_STATUS_LABELS,
  ROLE_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
} from "@/types";
import { ALL_RESOURCES, RESOURCE_LABELS, can, type Resource } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";

const WORK_DAY_OPTIONS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

const ROLE_ORDER: UserRole[] = [
  "OWNER",
  "DIRECTOR",
  "MANAGER",
  "MASTER",
  "DRIVER",
  "DESIGNER",
  "TECHNOLOGIST",
  "ADMIN",
  "WORKSHOP",
  "SEAMSTRESS",
  "MOBILOGRAPHER",
];

const MATRIX_RESOURCES: { resource: Resource; label: string }[] = ALL_RESOURCES.map(
  (resource) => ({ resource, label: RESOURCE_LABELS[resource] }),
);

function actionLabel(role: UserRole, resource: Resource): string {
  if (can(role, resource, "manage")) return "полный";
  if (can(role, resource, "write")) return "запись";
  if (can(role, resource, "read")) return "чтение";
  return "нет";
}

type SafeUser = Pick<
  UserAccount,
  "id" | "email" | "fullName" | "role" | "isActive"
>;

type Profile = {
  id: string;
  email: string;
  fullName: string;
};

type Props = {
  company: Company;
  settings: CompanySettings;
  users: SafeUser[];
  canWrite: boolean;
  profile: Profile;
  canRenameOthers: boolean;
};

type SavedName = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
};

async function saveDisplayName(userId: string, fullName: string): Promise<SavedName> {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 100) {
    throw new Error("Имя должно быть от 1 до 100 символов");
  }
  const res = await fetch("/api/settings/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, fullName: trimmed }),
  });
  const json = (await res.json().catch(() => null)) as {
    user?: SavedName;
    error?: string;
  } | null;
  if (!res.ok || !json?.user) {
    throw new Error(json?.error ?? "Не удалось сохранить имя");
  }
  return json.user;
}

export function SettingsForm({
  company,
  settings,
  users,
  canWrite,
  profile,
  canRenameOthers,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    workDays: [...settings.workDays],
    lateThresholdMinutes: settings.lateThresholdMinutes,
    latePenaltyAmount: settings.latePenaltyAmount,
    advanceMaxPercent: settings.advanceMaxPercent,
    defaultAssemblerPercent: settings.defaultAssemblerPercent,
    qrRotateSeconds: settings.qrRotateSeconds,
  });
  const [saving, setSaving] = useState(false);
  const [ownName, setOwnName] = useState(profile.fullName);
  const [seenProfileName, setSeenProfileName] = useState(profile.fullName);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [savingNameId, setSavingNameId] = useState<string | null>(null);

  if (profile.fullName !== seenProfileName) {
    setSeenProfileName(profile.fullName);
    setOwnName(profile.fullName);
  }

  function shownName(user: SafeUser) {
    return nameDrafts[user.id] ?? user.fullName;
  }

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        (nameDrafts[a.id] ?? a.fullName).localeCompare(
          nameDrafts[b.id] ?? b.fullName,
          "ru",
        ),
      ),
    [users, nameDrafts],
  );

  function rememberName(userId: string, fullName: string) {
    if (userId === profile.id) setOwnName(fullName);
    setNameDrafts((prev) => ({ ...prev, [userId]: fullName }));
  }

  async function onSaveName(userId: string, fullName: string) {
    setSavingNameId(userId);
    try {
      const saved = await saveDisplayName(userId, fullName);
      rememberName(userId, saved.fullName);
      toast.success("Имя сохранено");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить имя");
    } finally {
      setSavingNameId(null);
    }
  }

  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWorkDay(day: number) {
    setForm((prev) => {
      const has = prev.workDays.includes(day);
      return {
        ...prev,
        workDays: has
          ? prev.workDays.filter((d) => d !== day)
          : [...prev.workDays, day].sort((a, b) => a - b),
      };
    });
  }

  async function onSave() {
    if (!canWrite) {
      toast.error("Недостаточно прав для изменения настроек");
      return;
    }
    if (form.workDays.length === 0) {
      toast.error("Выберите хотя бы один рабочий день");
      return;
    }
    if (form.workStart >= form.workEnd) {
      toast.error("Начало смены должно быть раньше окончания");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => null)) as {
        settings?: CompanySettings;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? "Ошибка сохранения");
      }
      if (json?.settings) {
        setForm({
          workStart: json.settings.workStart,
          workEnd: json.settings.workEnd,
          workDays: [...json.settings.workDays],
          lateThresholdMinutes: json.settings.lateThresholdMinutes,
          latePenaltyAmount: json.settings.latePenaltyAmount,
          advanceMaxPercent: json.settings.advanceMaxPercent,
          defaultAssemblerPercent: json.settings.defaultAssemblerPercent,
          qrRotateSeconds: json.settings.qrRotateSeconds,
        });
      }
      toast.success("Настройки сохранены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Настройки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Компания, роли, правила производства и уведомления
          </p>
        </div>
        {canWrite && (
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Сохранить
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ваше имя</CardTitle>
          <CardDescription>
            Так вас видят в шапке. Имя сохраняется отдельно от остальных настроек.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void onSaveName(profile.id, ownName);
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="own-display-name">Отображаемое имя</Label>
              <Input
                id="own-display-name"
                name="fullName"
                autoComplete="name"
                maxLength={100}
                value={ownName}
                onChange={(event) => setOwnName(event.target.value)}
                disabled={savingNameId === profile.id}
              />
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <Button type="submit" disabled={savingNameId === profile.id}>
              {savingNameId === profile.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Сохранить имя
            </Button>
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="flex h-auto max-w-full justify-start gap-1 scroll-x p-1">
          <TabsTrigger value="company">Компания</TabsTrigger>
          <TabsTrigger value="users">Пользователи</TabsTrigger>
          <TabsTrigger value="roles">Роли</TabsTrigger>
          <TabsTrigger value="payroll">Зарплаты</TabsTrigger>
          <TabsTrigger value="advances">Авансы</TabsTrigger>
          <TabsTrigger value="penalties">Штрафы</TabsTrigger>
          <TabsTrigger value="worktime">Рабочее время</TabsTrigger>
          <TabsTrigger value="qr">QR</TabsTrigger>
          <TabsTrigger value="catalog">Справочники</TabsTrigger>
          <TabsTrigger value="notes">Модули</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Компания</CardTitle>
              <CardDescription>Основные сведения о юрлице и бренде</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input value={company.name} disabled />
              </div>
              <div className="space-y-2">
                <Label>Статус</Label>
                <Input
                  value={company.status === "active" ? "Активна" : "Скоро"}
                  disabled
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Слоган</Label>
                <Input value={company.tagline} disabled />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Input value={company.currency} disabled />
              </div>
              <div className="space-y-2">
                <Label>Часовой пояс</Label>
                <Input value={company.timezone} disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Пользователи</CardTitle>
              <CardDescription>
                {canRenameOthers
                  ? "Учётные записи компании. Имя сотрудника меняется в этой таблице."
                  : "Учётные записи компании"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 md:px-5 md:pb-5">
              {canRenameOthers ? (
                <ul
                  className="divide-y divide-border border-t border-border md:hidden"
                  aria-label="Пользователи"
                >
                  {sortedUsers.map((u) => (
                    <li key={u.id} className="space-y-2 px-4 py-3">
                      <p className="break-all text-xs text-muted-foreground">{u.email}</p>
                      <Input
                        aria-label={`Имя, ${u.email}`}
                        maxLength={100}
                        value={shownName(u)}
                        disabled={savingNameId === u.id}
                        onChange={(event) =>
                          setNameDrafts((prev) => ({ ...prev, [u.id]: event.target.value }))
                        }
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {ROLE_LABELS[u.role]}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant={u.isActive ? "default" : "secondary"}>
                            {u.isActive ? "Активен" : "Отключён"}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={savingNameId === u.id}
                            onClick={() => void onSaveName(u.id, shownName(u))}
                          >
                            {savingNameId === u.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Сохранить
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <MobileList inset aria-label="Пользователи">
                  {sortedUsers.map((u) => (
                    <MobileListItem
                      key={u.id}
                      title={shownName(u)}
                      subtitle={<span className="break-all">{u.email}</span>}
                      meta={ROLE_LABELS[u.role]}
                      valueMeta={
                        <Badge variant={u.isActive ? "default" : "secondary"}>
                          {u.isActive ? "Активен" : "Отключён"}
                        </Badge>
                      }
                    />
                  ))}
                </MobileList>
              )}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Логин</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {canRenameOthers ? (
                          <div className="flex min-w-64 items-center gap-2">
                            <Input
                              aria-label={`Имя, ${u.email}`}
                              maxLength={100}
                              value={shownName(u)}
                              disabled={savingNameId === u.id}
                              onChange={(event) =>
                                setNameDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: event.target.value,
                                }))
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingNameId === u.id}
                              onClick={() => void onSaveName(u.id, shownName(u))}
                            >
                              {savingNameId === u.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : null}
                              Сохранить
                            </Button>
                          </div>
                        ) : (
                          shownName(u)
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? "default" : "secondary"}>
                          {u.isActive ? "Активен" : "Отключён"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Матрица ролей</CardTitle>
              <CardDescription>
                Права ролей по умолчанию. Доступ конкретного сотрудника меняется в блоке «Сотрудники и доступ».
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Модуль</TableHead>
                    {ROLE_ORDER.map((r) => (
                      <TableHead key={r} className="text-center text-xs">
                        {ROLE_LABELS[r]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MATRIX_RESOURCES.map(({ resource, label }) => (
                    <TableRow key={resource}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {label}
                      </TableCell>
                      {ROLE_ORDER.map((role) => {
                        const a = actionLabel(role, resource);
                        return (
                          <TableCell
                            key={role}
                            className="text-center text-xs text-muted-foreground"
                          >
                            {a}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <CardTitle>Зарплаты</CardTitle>
              <CardDescription>
                Процент сборщика по умолчанию (defaultAssemblerPercent)
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-sm space-y-2">
              <Label htmlFor="defaultAssemblerPercent">% сборщика</Label>
              <Input
                id="defaultAssemblerPercent"
                type="number"
                min={0}
                max={100}
                disabled={!canWrite}
                value={form.defaultAssemblerPercent}
                onChange={(e) =>
                  patch("defaultAssemblerPercent", Number(e.target.value))
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advances">
          <Card>
            <CardHeader>
              <CardTitle>Правила авансов</CardTitle>
              <CardDescription>
                Максимальный процент аванса от начисления (advanceMaxPercent)
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-sm space-y-2">
              <Label htmlFor="advanceMaxPercent">Макс. % аванса</Label>
              <Input
                id="advanceMaxPercent"
                type="number"
                min={0}
                max={100}
                disabled={!canWrite}
                value={form.advanceMaxPercent}
                onChange={(e) =>
                  patch("advanceMaxPercent", Number(e.target.value))
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="penalties">
          <Card>
            <CardHeader>
              <CardTitle>Штрафы</CardTitle>
              <CardDescription>
                Порог опоздания и сумма штрафа
              </CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-xl gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lateThresholdMinutes">
                  Порог опоздания (мин)
                </Label>
                <Input
                  id="lateThresholdMinutes"
                  type="number"
                  min={0}
                  disabled={!canWrite}
                  value={form.lateThresholdMinutes}
                  onChange={(e) =>
                    patch("lateThresholdMinutes", Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="latePenaltyAmount">Штраф (₸)</Label>
                <Input
                  id="latePenaltyAmount"
                  type="number"
                  min={0}
                  disabled={!canWrite}
                  value={form.latePenaltyAmount}
                  onChange={(e) =>
                    patch("latePenaltyAmount", Number(e.target.value))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="worktime">
          <Card>
            <CardHeader>
              <CardTitle>Рабочее время</CardTitle>
              <CardDescription>
                Этот график используется для посещаемости: в нерабочие дни
                отметка прихода недоступна, а опоздание считается от начала смены.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="workStart">Начало</Label>
                  <Input
                    id="workStart"
                    type="time"
                    disabled={!canWrite}
                    value={form.workStart}
                    onChange={(e) => patch("workStart", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workEnd">Конец</Label>
                  <Input
                    id="workEnd"
                    type="time"
                    disabled={!canWrite}
                    value={form.workEnd}
                    onChange={(e) => patch("workEnd", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Рабочие дни</Label>
                <div className="flex flex-wrap gap-3">
                  {WORK_DAY_OPTIONS.map((d) => (
                    <label
                      key={d.value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={form.workDays.includes(d.value)}
                        disabled={!canWrite}
                        onCheckedChange={() => toggleWorkDay(d.value)}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr">
          <Card>
            <CardHeader>
              <CardTitle>QR посещаемости</CardTitle>
              <CardDescription>
                Интервал ротации QR-кода (qrRotateSeconds)
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-sm space-y-2">
              <Label htmlFor="qrRotateSeconds">Секунды ротации</Label>
              <Input
                id="qrRotateSeconds"
                type="number"
                min={10}
                disabled={!canWrite}
                value={form.qrRotateSeconds}
                onChange={(e) =>
                  patch("qrRotateSeconds", Number(e.target.value))
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Источники заявок</CardTitle>
              <CardDescription>Справочник источников лидов</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                <Badge key={key} variant="outline">
                  {label}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Статусы заказов</CardTitle>
              <CardDescription>Подписи этапов воронки</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                  <li
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium">{label}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Производственные этапы</CardTitle>
              <CardDescription>Этапы цеха</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(STAGE_LABELS).map(([key, label]) => (
                  <li
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium">{label}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Склад</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Управление остатками, перемещениями и минимальными запасами
              доступно в модуле «Склад». Пороговые оповещения о низком остатке
              приходят в уведомления.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Калькулятор</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Расчёт стоимости мебели и наценок находится в модуле «Калькулятор».
              Шаблоны расчёта хранятся в проекте калькулятора.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Шаблон КП</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Коммерческие предложения формируются из калькулятора. Редактирование
              шаблона PDF доступно при генерации КП.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Уведомления</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Колокольчик в шапке показывает новые события: заказы, задачи,
              опоздания, низкий остаток. Отметить прочитанными можно через
              API /api/notifications.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>AI Assistant</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Голосовой ассистент доступен на странице «Голосовой ассистент» и на
              главной. Распознавание речи работает в браузерах с Web Speech API.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
