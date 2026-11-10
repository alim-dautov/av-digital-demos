"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { formatDateRu, pluralRu } from "@/lib/utils";
import { stageLabel, type ProductionStageKey } from "@/types";
import { Button } from "@/components/ui/button";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ReportRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  stageId: string | null;
  stageLabel: string | null;
  employeeId: string;
  employeeName: string;
  whatDone: string;
  problems: string | null;
  materials: string | null;
  unitsDone: number;
  comment: string | null;
  createdAt: string;
};

export type OrderOption = {
  id: string;
  number: string;
  description: string;
  stages: { id: string; label: string; key: ProductionStageKey }[];
};

type Props = {
  reports: ReportRow[];
  orders: OrderOption[];
  canCreate: boolean;
  seeAll: boolean;
};

export function ReportsView({ reports, orders, canCreate, seeAll }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orderId, setOrderId] = useState("");
  const [stageId, setStageId] = useState("");
  const [whatDone, setWhatDone] = useState("");
  const [problems, setProblems] = useState("");
  const [materials, setMaterials] = useState("");
  const [unitsDone, setUnitsDone] = useState("0");
  const [comment, setComment] = useState("");

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === orderId),
    [orders, orderId],
  );

  function onOrderChange(id: string) {
    setOrderId(id);
    setStageId("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !whatDone.trim()) {
      toast.error("Укажите заказ и что сделано");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            stageId: stageId || null,
            whatDone: whatDone.trim(),
            problems: problems.trim() || null,
            materials: materials.trim() || null,
            unitsDone: Number(unitsDone) || 0,
            comment: comment.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Не удалось создать отчёт");
          return;
        }
        toast.success("Отчёт сохранён");
        setWhatDone("");
        setProblems("");
        setMaterials("");
        setUnitsDone("0");
        setComment("");
        setStageId("");
        router.refresh();
      } catch {
        toast.error("Ошибка сети");
      }
    });
  }

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Отчёты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {seeAll
            ? "Отчёты всех сотрудников по заказам"
            : "Ваши отчёты по выполненным работам"}
        </p>
      </header>

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Новый отчёт
            </CardTitle>
            <CardDescription>
              Зафиксируйте выполненную работу по заказу
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Заказ</Label>
                <Select value={orderId} onValueChange={onOrderChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите заказ" />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        №{o.number}: {o.description.slice(0, 40)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Этап</Label>
                <Select
                  value={stageId}
                  onValueChange={setStageId}
                  disabled={!selectedOrder?.stages.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Необязательно" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedOrder?.stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label || stageLabel(s.key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="whatDone">Что сделано</Label>
                <Textarea
                  id="whatDone"
                  value={whatDone}
                  onChange={(e) => setWhatDone(e.target.value)}
                  placeholder="Кратко опишите выполненную работу"
                  rows={3}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="problems">Проблемы</Label>
                <Textarea
                  id="problems"
                  value={problems}
                  onChange={(e) => setProblems(e.target.value)}
                  placeholder="Если были сложности"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="materials">Материалы</Label>
                <Textarea
                  id="materials"
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  placeholder="Использованные материалы"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unitsDone">Единиц выполнено</Label>
                <Input
                  id="unitsDone"
                  type="number"
                  min={0}
                  step={1}
                  value={unitsDone}
                  onChange={(e) => setUnitsDone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="comment">Комментарий</Label>
                <Input
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Дополнительно"
                />
              </div>

              <div className="sm:col-span-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Сохранение…" : "Отправить отчёт"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="reports-list-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="reports-list-title" className="text-base font-semibold">
            Список отчётов
          </h2>
          {reports.length > 0 && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {pluralRu(reports.length, ["запись", "записи", "записей"])}
            </span>
          )}
        </div>

        {reports.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel">
            <EmptyState
              compact
              icon={FileText}
              title="Отчётов пока нет"
              description={canCreate ? "Заполните форму выше, и отчёт появится здесь." : undefined}
            />
          </div>
        ) : (
        <>
        <MobileList aria-label="Отчёты">
          {reports.map((r) => (
            <MobileListItem
              key={r.id}
              href={`/orders/${r.orderId}`}
              title={`Заказ №${r.orderNumber}${r.stageLabel ? `, ${r.stageLabel}` : ""}`}
              subtitle={r.whatDone}
              meta={
                <>
                  {seeAll ? `${r.employeeName}, ` : ""}
                  {formatDateRu(r.createdAt.slice(0, 10))}
                  {r.problems && (
                    <span className="mt-0.5 block truncate text-destructive">
                      Проблемы: {r.problems}
                    </span>
                  )}
                </>
              }
              value={r.unitsDone > 0 ? `${r.unitsDone} ед.` : undefined}
            />
          ))}
        </MobileList>
        <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                {seeAll && <TableHead>Сотрудник</TableHead>}
                <TableHead>Заказ</TableHead>
                <TableHead>Этап</TableHead>
                <TableHead>Что сделано</TableHead>
                <TableHead className="text-right">Единиц</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDateRu(r.createdAt.slice(0, 10))}
                  </TableCell>
                  {seeAll && (
                    <TableCell className="font-medium">
                      {r.employeeName}
                    </TableCell>
                  )}
                  <TableCell>
                    <Link
                      href={`/orders/${r.orderId}`}
                      className="font-medium tabular-nums text-primary hover:underline"
                    >
                      №{r.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.stageLabel ?? "Без этапа"}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <p className="truncate">{r.whatDone}</p>
                    {r.problems ? (
                      <p className="mt-0.5 truncate text-xs text-destructive">
                        Проблемы: {r.problems}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.unitsDone > 0 ? r.unitsDone : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </>
        )}
      </section>
    </div>
  );
}
