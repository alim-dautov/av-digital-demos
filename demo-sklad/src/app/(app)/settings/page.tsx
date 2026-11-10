import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { DatabaseBackup, ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { mcpCallLog, apiTokens } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { accKind } from "@/lib/labels";
import { MODULES, MODULE_KEYS, type ModuleKey, type Permissions } from "@/lib/rbac";
import { fmtDate, fmtRelative } from "@/lib/format";
import { Avatar, Badge, Card, CardHeader, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { listTokens, listUsers } from "@/modules/users/service";
import { listAccounts, listCategories } from "@/modules/finance/service";
import { auditEntities, auditList, getAllSettings, listPriceTypes, listStatuses } from "@/modules/settings/service";
import { listWebhooks, WEBHOOK_EVENTS } from "@/modules/webhooks/service";
import { DeleteUser, ResetPassword, UserButton } from "./_components/users-tools";
import { AccountButton, CategoryButton, CompanyForm, DeleteStatus, ParamsForm, PriceTypeButton, StatusButton, SynonymsForm } from "./_components/settings-forms";
import { RevokeToken, TokenButton, WebhookActions, WebhookButton } from "./_components/integrations";

export const metadata = { title: "Настройки" };
type SP = { tab?: string; page?: string; user?: string; entity?: string; q?: string };

/** Краткий список доступов в порядке меню */
const accessList = (p: Permissions) => MODULE_KEYS.filter((m) => p.modules?.[m] && p.modules[m] !== "none").map((m) => `${MODULES[m]}${p.modules[m] === "view" ? " (просм.)" : ""}`).join(", ");
const ACTIONS: Record<string, string> = { create: "создание", update: "изменение", delete: "удаление", status: "статус", post: "проведение", login: "вход", export: "выгрузка" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("settings");
  const sp = await searchParams;
  const db = await getDb();
  const owner = u.isOwner;
  const tabs = [
    ...(owner ? [{ key: "users", label: "Сотрудники и права" }] : []),
    { key: "dicts", label: "Справочники" }, { key: "company", label: "Реквизиты" }, { key: "params", label: "Параметры" },
    ...(owner ? [{ key: "api", label: "API и MCP" }, { key: "webhooks", label: "Вебхуки" }, { key: "audit", label: "Журнал" }, { key: "backup", label: "Резервная копия" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;
  return (
    <>
      <PageHeader title="Настройки" subtitle={owner ? "Владелец · полный доступ" : "Справочники и параметры"} />
      <Tabs active={tab} items={tabs.map((t) => ({ ...t, href: `/settings?tab=${t.key}` }))} />
      {tab === "users" && await Users()}
      {tab === "dicts" && await Dicts()}
      {tab === "company" && <Card><CardHeader title="Реквизиты компании" subtitle="печатаются в накладных, актах сверки, КП и прайсах" /><CompanyForm value={(await getAllSettings(db)).company} /></Card>}
      {tab === "params" && await Params()}
      {tab === "api" && await Api()}
      {tab === "webhooks" && await Webhooks()}
      {tab === "audit" && await Audit()}
      {tab === "backup" && <Backup />}
    </>
  );

  async function Users() {
    const rows = await listUsers(db, u);
    type R = (typeof rows)[number];
    return (
      <Card className="overflow-hidden">
        <CardHeader title={`Сотрудники · ${rows.length}`} action={<UserButton />} />
        <DataTable<R> rows={rows} rowKey={(r) => r.id}
          columns={[
            { key: "n", header: "Сотрудник", cell: (r) => <span className="flex items-center gap-3"><Avatar name={r.name} color={r.color} /><span><b className="block">{r.name}</b><span className="text-xs text-ink-3">{r.login} · {r.position || "—"}</span></span></span> },
            { key: "a", header: "Доступ", cell: (r) => r.isOwner ? <Badge tone="warning">владелец</Badge> : <span className="block max-w-[420px] truncate text-xs text-ink-2">{accessList(r.permissions) || "нет доступа"}</span> },
            { key: "s", header: "Статус", cell: (r) => <span className="flex flex-wrap gap-1">{!r.active ? <Badge tone="neutral">отключён</Badge> : r.mustChangePassword ? <Badge tone="info">временный пароль</Badge> : <Badge tone="success">активен</Badge>}</span>, hideMd: true },
            { key: "l", header: "Был в сети", cell: (r) => (r.lastSeenAt ? fmtRelative(r.lastSeenAt) : "—"), hideMd: true },
            { key: "x", header: "", align: "right", cell: (r) => <span className="flex justify-end gap-1"><UserButton user={r} />{!r.isOwner && <><ResetPassword id={r.id} name={r.name} /><DeleteUser id={r.id} name={r.name} /></>}</span> },
          ]}
          mobile={(r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.name} color={r.color} />
              <div className="min-w-0 flex-1"><b className="block truncate text-sm">{r.name}</b><span className="block truncate text-xs text-ink-3">{r.position || r.login}{!r.active && " · отключён"}</span></div>
              <UserButton user={r} />{!r.isOwner && <ResetPassword id={r.id} name={r.name} />}
            </div>
          )} />
        <p className="flex gap-2 border-t border-line px-4 py-3 text-xs text-ink-3 sm:px-5"><ShieldCheck className="size-4 shrink-0" />Права проверяются на сервере для каждого запроса: UI, REST API и MCP. Закупочные цены и маржа без соответствующих флагов не уходят даже в API.</p>
      </Card>
    );
  }

  async function Dicts() {
    const [accs, cats, pts, sts] = await Promise.all([listAccounts(db), listCategories(db), listPriceTypes(db), listStatuses(db)]);
    const full = owner || u.permissions.modules.settings === "full";
    const Row = ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => <li className="flex min-h-12 items-center gap-3 px-4 py-1.5 sm:px-5"><div className="min-w-0 flex-1 text-sm">{children}</div>{full && actions}</li>;
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Кассы и счета" action={full && <AccountButton />} />
          <ul className="divide-y divide-line">{accs.map((a) => <Row key={a.id} actions={<AccountButton acc={a} />}><b>{a.name}</b> <span className="text-xs text-ink-3">· {accKind(a.kind)}{!a.active && " · не используется"}</span></Row>)}</ul>
        </Card>
        <Card><CardHeader title="Типы цен" subtitle="закупочная видна только с правом «Видеть закупочные цены»" action={full && <PriceTypeButton />} />
          <ul className="divide-y divide-line">{pts.map((t) => <Row key={t.id} actions={<PriceTypeButton t={t} />}><b>{t.name}</b>{t.isPurchase && <Badge tone="warning" className="ml-2">закупка</Badge>}{!t.active && <Badge tone="neutral" className="ml-2">откл.</Badge>}</Row>)}</ul>
        </Card>
        <Card><CardHeader title="Статусы заявок" action={full && <StatusButton />} />
          <ul className="divide-y divide-line">{sts.map((s) => (
            <Row key={s.id} actions={<span className="flex">{<StatusButton s={s} />}{s.code.startsWith("custom_") && <DeleteStatus id={s.id} name={s.name} />}</span>}>
              <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: s.color }} /><b>{s.name}</b></span>
              <span className="text-xs text-ink-3">{s.isCancelled ? " · отмена" : s.isFinal ? " · финальный" : ""}</span>
            </Row>
          ))}</ul>
        </Card>
        <Card><CardHeader title="Статьи доходов и расходов" />
          {(["income", "expense"] as const).map((k) => (
            <div key={k} className="border-t border-line first:border-0">
              <div className="flex items-center justify-between px-4 pt-3 sm:px-5"><span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{k === "income" ? "Приход" : "Расход"}</span>{full && <CategoryButton kind={k} />}</div>
              <ul className="divide-y divide-line">{cats.filter((c) => c.kind === k).map((c) => <Row key={c.id} actions={!c.code && <CategoryButton cat={c} kind={k} />}>{c.name}{c.code && <span className="ml-2 text-xs text-ink-3">системная</span>}</Row>)}</ul>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  async function Params() {
    const s = await getAllSettings(db);
    return (
      <div className="flex flex-col gap-5">
        <Card><CardHeader title="Параметры работы" /><ParamsForm value={{ debtPolicy: s.debtPolicy, payroll: s.payroll, leads: s.leads, tasks: s.tasks }} /></Card>
        {owner && <Card><CardHeader title="Синонимы поиска" subtitle="действуют в поиске товаров, контрагентов и при разборе списка" /><SynonymsForm value={s.search.synonyms} /></Card>}
      </div>
    );
  }

  async function Api() {
    const [tokens, log] = await Promise.all([
      listTokens(db, u),
      db.select({ id: mcpCallLog.id, tool: mcpCallLog.tool, ok: mcpCallLog.ok, error: mcpCallLog.error, durationMs: mcpCallLog.durationMs, createdAt: mcpCallLog.createdAt, token: apiTokens.name })
        .from(mcpCallLog).leftJoin(apiTokens, eq(apiTokens.id, mcpCallLog.tokenId)).orderBy(desc(mcpCallLog.id)).limit(50),
    ]);
    const base = process.env.APP_URL ?? "";
    return (
      <div className="flex flex-col gap-5">
        <Card className="overflow-hidden">
          <CardHeader title="API-токены" subtitle="токен показывается один раз; хранится только SHA-256" action={<TokenButton />} />
          {!tokens.length ? <EmptyState title="Токенов нет" text="Создайте токен для интеграции с 1С, сайтом или ИИ-ассистентом" /> : (
            <DataTable rows={tokens} rowKey={(t) => t.id}
              columns={[
                { key: "n", header: "Название", cell: (t) => <span><b className="block">{t.name}</b><code className="text-xs text-ink-3">{t.prefix}…</code></span> },
                { key: "p", header: "Права", cell: (t) => <span className="block max-w-[320px] truncate text-xs text-ink-2">{accessList(t.permissions) || "—"}</span>, hideMd: true },
                { key: "u", header: "Использован", cell: (t) => (t.lastUsedAt ? fmtRelative(t.lastUsedAt) : "никогда") },
                { key: "e", header: "Статус", cell: (t) => t.revokedAt ? <Badge tone="neutral">отозван</Badge> : t.expiresAt && new Date(t.expiresAt) < new Date() ? <Badge tone="danger">истёк</Badge> : <Badge tone="success">{t.expiresAt ? `до ${fmtDate(t.expiresAt)}` : "бессрочный"}</Badge> },
                { key: "x", header: "", align: "right", cell: (t) => (!t.revokedAt ? <RevokeToken id={t.id} name={t.name} /> : null) },
              ]}
              mobile={(t) => <div className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0"><b className="block truncate">{t.name}</b><span className="text-xs text-ink-3">{t.revokedAt ? "отозван" : t.lastUsedAt ? `исп. ${fmtRelative(t.lastUsedAt)}` : "не использовался"}</span></span>{!t.revokedAt && <RevokeToken id={t.id} name={t.name} />}</div>} />
          )}
        </Card>
        <Card>
          <CardHeader title="Подключение" />
          <div className="grid gap-4 px-4 pb-5 text-sm sm:px-5 lg:grid-cols-2">
            <div><p className="mb-1 font-semibold">REST API</p><p className="text-ink-2">Базовый адрес <code>{base}/api/v1</code>, описание — <Link className="text-info underline" href="/api/v1/openapi.json" target="_blank">OpenAPI</Link>. Лимит — 120 запросов в минуту на токен.</p></div>
            <div><p className="mb-1 font-semibold">MCP-сервер</p><p className="text-ink-2">Streamable HTTP: <code>{base}/api/mcp</code>, заголовок <code>Authorization: Bearer demo_…</code>. Инструменты: поиск товаров и остатков, клиенты и долги, заявки, задачи, лиды, отчёты.</p></div>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Журнал вызовов MCP" subtitle="последние 50" />
          {!log.length ? <EmptyState title="Вызовов ещё не было" /> : (
            <DataTable rows={log} rowKey={(r) => r.id}
              columns={[
                { key: "t", header: "Время", cell: (r) => fmtDate(r.createdAt, true) }, { key: "k", header: "Токен", cell: (r) => r.token ?? "—" },
                { key: "i", header: "Инструмент", cell: (r) => <code className="text-xs">{r.tool}</code> },
                { key: "o", header: "Результат", cell: (r) => (r.ok ? <Badge tone="success">ok</Badge> : <span className="text-xs text-danger">{r.error}</span>) },
                { key: "d", header: "мс", align: "right", cell: (r) => r.durationMs, hideMd: true },
              ]}
              mobile={(r) => <div className="flex justify-between gap-2 text-sm"><code className="truncate text-xs">{r.tool}</code><span className={r.ok ? "text-success" : "text-danger"}>{r.ok ? "ok" : "ошибка"} · {fmtRelative(r.createdAt)}</span></div>} />
          )}
        </Card>
      </div>
    );
  }

  async function Webhooks() {
    const rows = await listWebhooks(db, u);
    return (
      <Card className="overflow-hidden">
        <CardHeader title="Вебхуки" subtitle="POST-уведомления внешним системам о событиях" action={<WebhookButton events={WEBHOOK_EVENTS} />} />
        {!rows.length ? <EmptyState title="Вебхуков нет" text="Например, отправлять новые заявки в Telegram-бота или 1С" /> : (
          <ul className="divide-y divide-line">{rows.map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{w.name}{!w.active && <Badge tone="neutral" className="ml-2">выкл.</Badge>}</p>
                <p className="truncate text-xs text-ink-3">{w.url}</p>
                <p className="mt-0.5 text-xs text-ink-2">{w.events.map((e) => WEBHOOK_EVENTS[e as keyof typeof WEBHOOK_EVENTS] ?? e).join(", ")}</p>
                {w.lastCalledAt && <p className="text-xs text-ink-3">последний вызов {fmtRelative(w.lastCalledAt)} · <span className={w.lastStatus && w.lastStatus < 300 ? "text-success" : "text-danger"}>{w.lastStatus || "нет ответа"}</span></p>}
              </div>
              <WebhookButton hook={w} events={WEBHOOK_EVENTS} /><WebhookActions id={w.id} name={w.name} />
            </li>
          ))}</ul>
        )}
      </Card>
    );
  }

  async function Audit() {
    const page = Number(sp.page) || 1;
    const [res, users, entities] = await Promise.all([
      auditList(db, u, { userId: Number(sp.user) || undefined, entity: sp.entity || undefined, q: sp.q || undefined, page }),
      listUsers(db, u), auditEntities(db),
    ]);
    const href = (pg: number) => `/settings?${new URLSearchParams({ tab: "audit", ...(sp.user ? { user: sp.user } : {}), ...(sp.entity ? { entity: sp.entity } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(pg) })}`;
    return (
      <Card className="overflow-hidden">
        <form className="flex flex-wrap gap-2 border-b border-line p-3 sm:px-4" action="/settings">
          <input type="hidden" name="tab" value="audit" />
          <Input name="q" defaultValue={sp.q} placeholder="Поиск по описанию" className="max-w-60" />
          <Select name="user" defaultValue={sp.user ?? ""} className="max-w-48"><option value="">Все сотрудники</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <Select name="entity" defaultValue={sp.entity ?? ""} className="max-w-48"><option value="">Все объекты</option>{entities.map((e) => <option key={e} value={e}>{e}</option>)}</Select>
          <button className={buttonClass("secondary")}>Найти</button>
        </form>
        <DataTable rows={res.rows} rowKey={(r) => r.id}
          columns={[
            { key: "t", header: "Когда", cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.createdAt, true)}</span> },
            { key: "u", header: "Кто", cell: (r) => <span>{r.userName ?? "система"}{r.tokenId && <Badge tone="info" className="ml-1">API</Badge>}</span> },
            { key: "a", header: "Действие", cell: (r) => <span className="text-xs text-ink-3">{ACTIONS[r.action] ?? r.action} · {r.entity}{r.entityId ? ` #${r.entityId}` : ""}</span>, hideMd: true },
            { key: "s", header: "Описание", cell: (r) => <span className="block max-w-[520px] truncate">{r.summary}</span> },
          ]}
          mobile={(r) => <div className="text-sm"><p className="truncate">{r.summary}</p><p className="text-xs text-ink-3">{r.userName ?? "система"} · {fmtDate(r.createdAt, true)}</p></div>} />
        <Pagination page={res.page} pageSize={res.size} total={res.total} href={href} />
      </Card>
    );
  }
}

function Backup() {
  return (
    <Card>
      <CardHeader title="Резервная копия" />
      <div className="flex flex-col gap-4 px-4 pb-5 text-sm sm:px-5">
        <p className="text-ink-2">Выгрузка всех данных в JSON: товары, клиенты, документы, оплаты, задачи, зарплата, журнал. Хэши паролей, токенов и секреты вебхуков не выгружаются.</p>
        <a href="/api/settings/backup" className={buttonClass("accent", "md", "self-start")}><DatabaseBackup className="size-4" />Скачать резервную копию</a>
        <div className="rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
          <p className="mb-1 font-semibold text-ink">Полная копия базы (рекомендуется ежедневно)</p>
          <code className="block whitespace-pre-wrap">docker compose exec db pg_dump -U demo -Fc demo &gt; backup-$(date +%F).dump</code>
          <p className="mt-1">Восстановление: <code>pg_restore -U demo -d demo --clean backup.dump</code>. Файлы вложений лежат в томе <code>uploads</code>.</p>
        </div>
      </div>
    </Card>
  );
}
