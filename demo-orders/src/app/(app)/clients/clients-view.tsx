"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { formatDateRu, formatKzt, pluralRu } from "@/lib/utils";
import type { Client, LeadSource } from "@/types";
import { SOURCE_LABELS } from "@/types";

const ALL_SOURCES = Object.keys(SOURCE_LABELS) as LeadSource[];

type ClientsViewProps = {
  clients: Client[];
  canWrite: boolean;
};

export function ClientsView({ clients, canWrite }: ClientsViewProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [source, setSource] = React.useState<string>("all");
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    fullName: "",
    phone: "",
    whatsapp: "",
    email: "",
    source: "instagram" as LeadSource,
    comment: "",
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (source !== "all" && c.source !== source) return false;
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [clients, query, source]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          whatsapp: form.whatsapp || null,
          email: form.email || null,
          source: form.source,
          comment: form.comment || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Не удалось создать клиента");
        return;
      }
      toast.success("Клиент создан");
      setOpen(false);
      setForm({
        fullName: "",
        phone: "",
        whatsapp: "",
        email: "",
        source: "instagram",
        comment: "",
      });
      router.refresh();
      if (data.client?.id) router.push(`/clients/${data.client.id}`);
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Клиенты</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length === clients.length ? (
              <>Всего: <span className="tabular-nums text-foreground">{clients.length}</span></>
            ) : (
              <>
                Найдено <span className="tabular-nums text-foreground">{filtered.length}</span> из{" "}
                <span className="tabular-nums">{clients.length}</span>
              </>
            )}
          </p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Новый клиент
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новый клиент</DialogTitle>
                <DialogDescription>
                  Добавьте контакт в базу Mebel Demo
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">ФИО</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fullName: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Телефон</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={form.whatsapp}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, whatsapp: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Источник</Label>
                  <Select
                    value={form.source}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, source: v as LeadSource }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SOURCE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comment">Комментарий</Label>
                  <Textarea
                    id="comment"
                    value={form.comment}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, comment: e.target.value }))
                    }
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Сохранение…
                      </>
                    ) : (
                      "Создать"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по имени, телефону, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Источник" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все источники</SelectItem>
            {ALL_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {SOURCE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead className="text-right">Заказы</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Последний заказ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {c.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {c.phone}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{SOURCE_LABELS[c.source]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.ordersCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKzt(c.totalAmount)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {c.lastOrderAt ? formatDateRu(c.lastOrderAt) : "Нет заказов"}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <EmptyState
                        icon={Search}
                        title="Клиенты не найдены"
                        description="Измените запрос или сбросьте фильтры."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {filtered.length > 0 ? (
        <MobileList aria-label="Клиенты">
          {filtered.map((c) => (
            <MobileListItem
              key={c.id}
              href={`/clients/${c.id}`}
              title={c.fullName}
              subtitle={<span className="tabular-nums">{c.phone}</span>}
              meta={
                c.lastOrderAt
                  ? `${pluralRu(c.ordersCount, ["заказ", "заказа", "заказов"])}, последний ${formatDateRu(c.lastOrderAt)}`
                  : pluralRu(c.ordersCount, ["заказ", "заказа", "заказов"])
              }
              value={formatKzt(c.totalAmount)}
              valueMeta={SOURCE_LABELS[c.source]}
            />
          ))}
        </MobileList>
      ) : (
        <div className="rounded-lg border border-border bg-panel md:hidden">
          <EmptyState
            icon={Search}
            title="Клиенты не найдены"
            description="Измените запрос или сбросьте фильтры."
          />
        </div>
      )}
    </div>
  );
}
