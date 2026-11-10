import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, NotFoundError } from "@/lib/rbac";
import { fmtDate, num } from "@/lib/format";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { getInventory } from "@/modules/inventory/service";
import { PostInventory } from "./post-button";

export const metadata = { title: "Инвентаризация" };

export default async function InventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("stock");
  const db = await getDb();
  const inv = await getInventory(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  return (
    <>
      <PageHeader back={<BackLink href="/stock?tab=inventory">Склад</BackLink>}
        title={<span className="flex items-center gap-3">Инвентаризация №{inv.number}{inv.posted ? <Badge tone="success">проведена</Badge> : <Badge tone="neutral">черновик</Badge>}</span>}
        subtitle={fmtDate(inv.date)} actions={!inv.posted && can(u, "stock", "full") && <PostInventory id={inv.id} />} />
      <Card className="overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-3"><th className="px-4 py-2.5">Товар</th><th className="px-4 py-2.5 text-right">Учёт</th><th className="px-4 py-2.5 text-right">Факт</th><th className="px-4 py-2.5 text-right">Разница</th></tr></thead>
            <tbody>{inv.items.map((i) => {
              const d = Number(i.actual) - Number(i.expected);
              return (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5"><Link href={`/products/${i.productId}`} className="font-semibold hover:underline">{i.name}</Link></td>
                  <td className="tnum px-4 py-2.5 text-right">{num(Number(i.expected))} {i.unit}</td>
                  <td className="tnum px-4 py-2.5 text-right">{num(Number(i.actual))} {i.unit}</td>
                  <td className={cn("tnum px-4 py-2.5 text-right font-bold", d < 0 ? "text-danger" : d > 0 ? "text-success" : "text-ink-3")}>{d > 0 ? "+" : ""}{num(d)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {inv.comment && <p className="border-t border-line p-4 text-sm">{inv.comment}</p>}
      </Card>
    </>
  );
}
