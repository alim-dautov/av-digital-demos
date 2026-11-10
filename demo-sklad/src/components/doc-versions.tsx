import { FileText } from "lucide-react";
import { getDb } from "@/db";
import type { Principal } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui";
import { listDocVersions, type DocEntity } from "@/modules/docs/service";

/** История отправленных клиенту версий: каждая — свой неизменяемый PDF */
export async function DocVersions({ p, entity, id }: { p: Principal; entity: DocEntity; id: number }) {
  const rows = await listDocVersions(await getDb(), p, entity, id);
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader title={`Отправленные версии · ${rows.length}`} subtitle="файл каждой версии не меняется" />
      <ul className="divide-y divide-line text-sm">
        {rows.map((v, i) => (
          <li key={v.id}>
            <a href={v.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
              <FileText className="mt-0.5 size-4 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Версия {v.version}{i === 0 && <span className="ml-2 text-xs font-normal text-success">последняя</span>}</span>
                <span className="block text-xs text-ink-3">{fmtDate(v.createdAt, true)}{v.author ? ` · ${v.author}` : ""} · {v.items} поз.</span>
                {v.changes.length > 0 && <span className="mt-1 block text-xs text-ink-2">{v.changes.slice(0, 3).join("; ")}{v.changes.length > 3 ? ` и ещё ${v.changes.length - 3}` : ""}</span>}
              </span>
              <b className="tnum shrink-0">{money(v.total)}</b>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
