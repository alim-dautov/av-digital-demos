import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSignature, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { searchProposals } from "@/lib/services/calculator";
import { formatDateRu, formatKzt, pluralRu } from "@/lib/utils";

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) return null;
  if (!can(session, "proposals", "read")) redirect("/");

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const proposals = searchProposals(session.companyId, q);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Коммерческие предложения</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {q ? `Найдено: ${pluralRu(proposals.length, ["КП", "КП", "КП"])}` : "Все сформированные КП сохраняются автоматически"}
          </p>
        </div>
        {can(session, "calculator", "write") && (
          <Button asChild>
            <Link href="/calculator">Новый расчёт</Link>
          </Button>
        )}
      </header>

      <form action="/proposals" className="flex max-w-xl gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Имя клиента, телефон или адрес"
            aria-label="Поиск КП"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Найти
        </Button>
        {q && (
          <Button variant="ghost" asChild>
            <Link href="/proposals">Сбросить</Link>
          </Button>
        )}
      </form>

      {proposals.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <EmptyState
            icon={FileSignature}
            title={q ? "Ничего не найдено" : "КП пока нет"}
            description={q ? "Попробуйте другое имя, номер телефона или адрес" : "Сформируйте КП в калькуляторе — оно сохранится здесь"}
          />
        </div>
      ) : (
        <>
          <MobileList aria-label="КП">
            {proposals.map((p) => (
              <MobileListItem
                key={p.id}
                href={`/proposals/${p.id}`}
                title={p.displayClientName || "Клиент не указан"}
                subtitle={p.displayAddress || p.displayClientPhone}
                meta={`${p.number} · ${formatDateRu(p.createdAt)}`}
                value={formatKzt(p.total)}
              />
            ))}
          </MobileList>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Номер</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead>Клиент</TableHead>
                    <TableHead>Адрес объекта</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((p) => (
                    <TableRow key={p.id} className="relative">
                      <TableCell className="font-medium tabular-nums">
                        <Link href={`/proposals/${p.id}`} className="after:absolute after:inset-0 hover:text-primary">
                          {p.number}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{formatDateRu(p.createdAt)}</TableCell>
                      <TableCell>
                        <p>{p.displayClientName || "—"}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{p.displayClientPhone}</p>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{p.displayAddress || "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatKzt(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
