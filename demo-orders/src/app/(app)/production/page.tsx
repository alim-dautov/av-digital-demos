import { ProductionKanban } from "@/features/production/production-kanban";
import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getProductionStagesSummary } from "@/lib/services/analytics";
import { buildProductionBoard } from "@/lib/services/production";

export default async function ProductionPage() {
  const session = await requirePageAccess("production");

  const companyId = session.companyId;
  const summary = getProductionStagesSummary(companyId);
  const { cards } = buildProductionBoard(companyId);
  const canWrite = can(session, "production", "write");

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Производство
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          В цехе: <span className="tabular-nums text-foreground">{cards.length}</span>
        </p>
      </header>

      <section
        aria-labelledby="production-load"
        className="rounded-lg border border-border bg-panel p-4 sm:p-5"
      >
        <h2 id="production-load" className="text-sm text-muted-foreground">
          Этапы в работе сейчас
        </h2>
        <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 sm:gap-x-6 sm:gap-y-4 xl:grid-cols-6">
          {summary.map((s) => (
            <div key={s.key} className="flex min-w-0 flex-col">
              <dt className="line-clamp-2 text-xs leading-tight text-muted-foreground">
                {s.label}
              </dt>
              <dd
                className={
                  s.count > 0
                    ? "mt-auto pt-1 text-lg font-semibold tabular-nums tracking-tight text-foreground sm:text-xl"
                    : "mt-auto pt-1 text-lg font-semibold tabular-nums tracking-tight text-muted-foreground/60 sm:text-xl"
                }
              >
                {s.count}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <ProductionKanban initialCards={cards} canWrite={canWrite} />
    </div>
  );
}
