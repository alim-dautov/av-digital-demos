"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatKzt, todayDate } from "@/lib/utils";
import type { FunnelStage, LeadSource, OrderWorkerVisibility, ProductionStageKey } from "@/types";
import { SOURCE_LABELS, STAGE_LABELS } from "@/types";
import { DEFAULT_ORDER_VISIBILITY } from "@/lib/order-visibility";
import { orderBalance } from "@/lib/domain/order-money";
import { WorkerVisibilityFields } from "./worker-visibility-fields";

export type CreateOrderOption = { id: string; fullName: string };
export type CreateOrderClientOption = CreateOrderOption & { address?: string | null };

const DEFAULT_STAGES: FunnelStage[] = (
  Object.keys(STAGE_LABELS) as (keyof typeof STAGE_LABELS)[]
)
  .filter((k) => k !== "done")
  .map((key) => ({ key, label: STAGE_LABELS[key] }));

const SOURCES = Object.keys(SOURCE_LABELS) as LeadSource[];

export function CreateOrderForm({
  clients,
  employees,
  masters,
  onSuccess,
  funnel = DEFAULT_STAGES,
  canCreateClient = true,
}: {
  clients: CreateOrderClientOption[];
  employees: CreateOrderOption[];
  masters: CreateOrderOption[];
  onSuccess?: (orderNumber: string) => void;
  /** Этапы из воронки компании (без «Готово»). */
  funnel?: FunnelStage[];
  /** Можно ли вписать нового клиента прямо в форме (право clients:write). */
  canCreateClient?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const NEW_CLIENT = "__new";
  const isNewClient = clientId === NEW_CLIENT || (canCreateClient && clients.length === 0);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [address, setAddress] = useState("");
  const clientOk = isNewClient
    ? Boolean(newClientName.trim() && newClientPhone.trim())
    : Boolean(clientId);
  const [source, setSource] = useState<LeadSource>("instagram");
  const [amount, setAmount] = useState("");
  const [prepayment, setPrepayment] = useState("0");
  const [date, setDate] = useState(todayDate());
  const [deadline, setDeadline] = useState("");
  const [responsibleId, setResponsibleId] = useState<string>("");
  const [masterId, setMasterId] = useState<string>("");
  const [secondMasterId, setSecondMasterId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [materialsNote, setMaterialsNote] = useState("");
  const [hardwareNote, setHardwareNote] = useState("");
  const [furnitureUnits, setFurnitureUnits] = useState("1");
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stages, setStages] = useState<ProductionStageKey[]>(() => {
    const preset: string[] = ["cutting", "edging", "drilling", "assembly", "installation"];
    const keys = funnel.map((s) => s.key);
    const picked = keys.filter((k) => preset.includes(k));
    return picked.length > 0 ? picked : keys;
  });
  const [visibility, setVisibility] = useState<OrderWorkerVisibility>({
    ...DEFAULT_ORDER_VISIBILITY,
  });
  const amountValue = Number(amount);
  const prepaymentValue = Number(prepayment);
  const balance = orderBalance({
    amount: Number.isFinite(amountValue) ? amountValue : 0,
    prepayment: Number.isFinite(prepaymentValue) ? prepaymentValue : 0,
    payments: [],
  });

  function toggleStage(key: ProductionStageKey) {
    setStages((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientOk || !description.trim() || !deadline || !amount) {
      setShowErrors(true);
      toast.error("Заполните обязательные поля");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNewClient
            ? { newClient: { fullName: newClientName.trim(), phone: newClientPhone.trim() } }
            : { clientId }),
          address,
          source,
          amount: Number(amount),
          prepayment: Number(prepayment) || 0,
          date,
          deadline,
          responsibleId: responsibleId || null,
          masterId: masterId || null,
          masterIds: [masterId, secondMasterId].filter(Boolean),
          description: description.trim(),
          comment: comment.trim() || null,
          materialsNote: materialsNote.trim() || null,
          hardwareNote: hardwareNote.trim() || null,
          furnitureUnits: Number(furnitureUnits) || 1,
          stages,
          workerVisibility: visibility,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось создать заказ");
        return;
      }
      toast.success(`Заказ №${data.order.number} создан`);
      onSuccess?.(data.order.number);
      startTransition(() => {
        router.refresh();
        router.push(`/orders/${data.order.number}`);
      });
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSubmitting(false);
    }
  }

  const errors = {
    clientId: showErrors && !clientOk,
    amount: showErrors && !amount,
    deadline: showErrors && !deadline,
    description: showErrors && !description.trim(),
  };
  const busy = submitting || pending;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Клиент и сроки
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="order-client"
            label="Клиент"
            required
            error={
              errors.clientId
                ? isNewClient
                  ? "Укажите имя и телефон клиента"
                  : "Выберите клиента"
                : undefined
            }
            className="sm:col-span-2"
          >
            <Select
              value={clientId}
              onValueChange={(value) => {
                setClientId(value);
                setAddress(
                  value === NEW_CLIENT
                    ? ""
                    : clients.find((client) => client.id === value)?.address ?? "",
                );
              }}
            >
              <SelectTrigger
                id="order-client"
                aria-invalid={errors.clientId || undefined}
                aria-describedby={errors.clientId ? "order-client-error" : undefined}
              >
                <SelectValue placeholder="Выберите клиента" />
              </SelectTrigger>
              <SelectContent>
                {canCreateClient && (
                  <SelectItem value={NEW_CLIENT}>+ Новый клиент</SelectItem>
                )}
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isNewClient && (
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="order-new-client-name">Имя клиента</Label>
                  <Input
                    id="order-new-client-name"
                    autoComplete="name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    aria-label="Имя нового клиента"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order-new-client-phone">Телефон</Label>
                  <Input
                    id="order-new-client-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+7 777 123 45 67"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    aria-label="Телефон нового клиента"
                  />
                </div>
              </div>
            )}
          </Field>

          <Field id="order-address" label="Адрес объекта" className="sm:col-span-2">
            <Input
              id="order-address"
              autoComplete="street-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </Field>

          <Field id="order-source" label="Источник" required>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as LeadSource)}
            >
              <SelectTrigger id="order-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((src) => (
                  <SelectItem key={src} value={src}>
                    {SOURCE_LABELS[src]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="order-amount"
            label="Сумма, ₸"
            required
            error={errors.amount ? "Укажите сумму" : undefined}
          >
            <Input
              id="order-amount"
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="tabular-nums"
              aria-invalid={errors.amount || undefined}
              aria-describedby={errors.amount ? "order-amount-error" : undefined}
            />
          </Field>

          <Field id="order-prepayment" label="Предоплата, ₸">
            <Input
              id="order-prepayment"
              type="number"
              inputMode="numeric"
              min={0}
              value={prepayment}
              onChange={(event) => setPrepayment(event.target.value)}
              placeholder="0"
              className="tabular-nums"
            />
          </Field>

          <Field id="order-balance" label="Остаток, ₸">
            <Input
              id="order-balance"
              value={formatKzt(balance)}
              readOnly
              aria-readonly="true"
              className="tabular-nums"
            />
          </Field>

          <Field id="order-date" label="Дата">
            <Input
              id="order-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tabular-nums"
            />
          </Field>

          <Field
            id="order-deadline"
            label="Дедлайн"
            required
            error={errors.deadline ? "Укажите дедлайн" : undefined}
          >
            <Input
              id="order-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="tabular-nums"
              aria-invalid={errors.deadline || undefined}
              aria-describedby={errors.deadline ? "order-deadline-error" : undefined}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Команда
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="order-responsible" label="Ответственный">
            <Select
              value={responsibleId || "__none"}
              onValueChange={(v) => setResponsibleId(v === "__none" ? "" : v)}
            >
              <SelectTrigger id="order-responsible">
                <SelectValue placeholder="Не назначен" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Не назначен</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="order-master" label="Мастер">
            <Select
              value={masterId || "__none"}
              onValueChange={(v) => setMasterId(v === "__none" ? "" : v)}
            >
              <SelectTrigger id="order-master">
                <SelectValue placeholder="Не назначен" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Не назначен</SelectItem>
                {masters.filter((m) => m.id !== secondMasterId).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="order-master-second" label="Второй мастер (необязательно)">
            <Select value={secondMasterId || "__none"} onValueChange={(v) => setSecondMasterId(v === "__none" ? "" : v)}>
              <SelectTrigger id="order-master-second"><SelectValue placeholder="Не назначен" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Не назначен</SelectItem>
                {masters.filter((m) => m.id !== masterId).map((m) => <SelectItem key={m.id} value={m.id}>{m.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Что производим
        </legend>
        <Field
          id="order-description"
          label="Описание"
          required
          error={errors.description ? "Опишите заказ" : undefined}
        >
          <Textarea
            id="order-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Например: кухонный гарнитур, 3,2 м, фасады МДФ"
            aria-invalid={errors.description || undefined}
            aria-describedby={
              errors.description ? "order-description-error" : undefined
            }
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field id="order-comment" label="Комментарий">
            <Textarea
              id="order-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </Field>
          <Field id="order-units" label="Единиц мебели">
            <Input
              id="order-units"
              type="number"
              inputMode="numeric"
              min={1}
              value={furnitureUnits}
              onChange={(e) => setFurnitureUnits(e.target.value)}
              className="tabular-nums"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="order-materials"
            label="Материалы"
            hint="Через запятую. Каждый материал станет пунктом чек-листа."
          >
            <Textarea
              id="order-materials"
              value={materialsNote}
              onChange={(e) => setMaterialsNote(e.target.value)}
              rows={2}
              aria-describedby="order-materials-hint"
            />
          </Field>
          <Field id="order-hardware" label="Фурнитура">
            <Textarea
              id="order-hardware"
              value={hardwareNote}
              onChange={(e) => setHardwareNote(e.target.value)}
              rows={2}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Этапы производства
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {funnel.map(({ key, label }) => {
            const checked = stages.includes(key);
            return (
              <label
                key={key}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                  checked
                    ? "bg-primary/12 text-foreground"
                    : "bg-panel-elevated text-muted-foreground hover:text-foreground",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleStage(key)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-foreground">
          Что видит сотрудник на заказе
        </legend>
        <p className="mb-3 text-xs text-muted-foreground">
          Сборщик/водитель увидит только отмеченное. Можно изменить позже в карточке заказа.
        </p>
        <WorkerVisibilityFields value={visibility} onChange={setVisibility} />
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          <span aria-hidden>*</span> обязательные поля
        </p>
        <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
          {busy ? "Создание…" : "Создать заказ"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-muted-foreground" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (обязательно)</span>}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
