/**
 * Схема БД Electro Demo CRM.
 * Денежные суммы — bigint в тиынах (1 ₸ = 100 тиын). Количества — numeric(14,3).
 * Ставки процентов — в базисных пунктах (1% = 100 bp).
 */
import {
  pgTable, serial, integer, text, boolean, timestamp, date, jsonb, bigint, numeric, index, uniqueIndex,
  primaryKey, doublePrecision,
} from "drizzle-orm/pg-core";

const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" }).notNull().default(0);
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const deleted = () => timestamp("deleted_at", { withTimezone: true });

/* ───────────── Пользователи, доступ ───────────── */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  login: text("login").notNull(),
  name: text("name").notNull(),
  position: text("position").notNull().default(""),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  isOwner: boolean("is_owner").notNull().default(false),
  isSalesManager: boolean("is_sales_manager").notNull().default(false),
  isAssembler: boolean("is_assembler").notNull().default(false),
  active: boolean("active").notNull().default(true),
  /** { modules: Record<ModuleKey, 'none'|'view'|'full'>, flags: Record<FlagKey, boolean> } */
  permissions: jsonb("permissions").$type<import("@/lib/rbac").Permissions>().notNull(),
  /** Недельный план продаж, тиын */
  weeklyPlan: money("weekly_plan"),
  color: text("color").notNull().default("#0B2B54"),
  /** Настройки уведомлений: { [eventType]: boolean } */
  notifyPrefs: jsonb("notify_prefs").$type<Record<string, boolean>>().notNull().default({}),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: created(),
  deletedAt: deleted(),
}, (t) => [uniqueIndex("users_login_uq").on(t.login)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(token)
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  createdAt: created(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  tokenId: integer("token_id"),
  action: text("action").notNull(), // create|update|delete|status|post|login|...
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull().default(""),
  data: jsonb("data"),
  createdAt: created(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt), index("audit_user_idx").on(t.userId)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updated(),
});

/* ───────────── Файлы ───────────── */

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  uploadedBy: integer("uploaded_by"),
  createdAt: created(),
});
export type FileRef = { id: number; name: string; mime: string; size: number };

/** Отправленные клиенту версии документов: неизменяемый PDF + снимок строк для сравнения */
export const docVersions = pgTable("doc_versions", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(), // order | shipment | quote
  entityId: integer("entity_id").notNull(),
  version: integer("version").notNull(),
  fileId: integer("file_id").notNull().references(() => files.id),
  token: text("token").notNull(),
  title: text("title").notNull(),
  total: money("total"),
  lines: jsonb("lines").$type<{ name: string; unit: string; qty: number; price: number }[]>().notNull(),
  hash: text("hash").notNull(),
  createdBy: integer("created_by"),
  createdAt: created(),
}, (t) => [uniqueIndex("doc_versions_uq").on(t.entity, t.entityId, t.version), uniqueIndex("doc_versions_token_uq").on(t.token)]);

/* ───────────── Товары ───────────── */

export const priceTypes = pgTable("price_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isPurchase: boolean("is_purchase").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("price_types_code_uq").on(t.code)]);

export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  sort: integer("sort").notNull().default(0),
  createdAt: created(),
}, (t) => [index("folders_parent_idx").on(t.parentId)]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku"),
  barcode: text("barcode"),
  unit: text("unit").notNull().default("шт"),
  description: text("description").notNull().default(""),
  folderId: integer("folder_id").references(() => folders.id, { onDelete: "set null" }),
  photos: jsonb("photos").$type<FileRef[]>().notNull().default([]),
  minStock: qty("min_stock"),
  active: boolean("active").notNull().default(true),
  searchText: text("search_text").notNull().default(""),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: deleted(),
}, (t) => [
  index("products_name_idx").on(t.name),
  index("products_sku_idx").on(t.sku),
  index("products_barcode_idx").on(t.barcode),
  index("products_folder_idx").on(t.folderId),
  index("products_search_idx").on(t.searchText),
]);

export const productPrices = pgTable("product_prices", {
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  priceTypeId: integer("price_type_id").notNull().references(() => priceTypes.id, { onDelete: "cascade" }),
  value: money("value"),
}, (t) => [primaryKey({ columns: [t.productId, t.priceTypeId] })]);

export const priceBatches = pgTable("price_batches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  description: text("description").notNull(),
  /** [{productId, priceTypeId, old, new}] */
  changes: jsonb("changes").$type<{ productId: number; priceTypeId: number; old: number; new: number }[]>().notNull(),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  createdAt: created(),
});

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  priceTypeId: integer("price_type_id").notNull(),
  oldValue: money("old_value"),
  newValue: money("new_value"),
  userId: integer("user_id"),
  batchId: integer("batch_id"),
  source: text("source").notNull().default("manual"), // manual|batch|receipt|rollback|import
  createdAt: created(),
}, (t) => [index("price_history_product_idx").on(t.productId, t.createdAt)]);

/* ───────────── Контрагенты ───────────── */

export const counterpartyTags = pgTable("counterparty_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2563EB"),
}, (t) => [uniqueIndex("cp_tags_name_uq").on(t.name)]);

export const counterparties = pgTable("counterparties", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("client"), // client|supplier|both
  name: text("name").notNull(),
  isService: boolean("is_service").notNull().default(false),
  /** Сегмент для аналитики и зарплат: bazaar|shop|install|other */
  segment: text("segment").notNull().default("other"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  address: text("address"),
  bin: text("bin"),
  comment: text("comment").notNull().default(""),
  contacts: jsonb("contacts").$type<{ name: string; phone?: string; role?: string }[]>().notNull().default([]),
  documents: jsonb("documents").$type<FileRef[]>().notNull().default([]),
  managerId: integer("manager_id").references(() => users.id, { onDelete: "set null" }),
  debtLimit: money("debt_limit"), // 0 = без лимита
  debtLimitMode: text("debt_limit_mode").notNull().default("default"), // default|warn|block|none
  /** Токен личного кабинета клиента (/p/client/<token>); null — ссылка не выдана или отозвана */
  portalToken: text("portal_token"),
  portalCreatedAt: timestamp("portal_created_at", { withTimezone: true }),
  portalViewedAt: timestamp("portal_viewed_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: deleted(),
}, (t) => [index("cp_name_idx").on(t.name), index("cp_kind_idx").on(t.kind), index("cp_manager_idx").on(t.managerId), uniqueIndex("cp_portal_token_uq").on(t.portalToken)]);

/* ───────────── Склад ───────────── */

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

/* ───────────── Заявки ───────────── */

export const orderStatuses = pgTable("order_statuses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sort: integer("sort").notNull().default(0),
  isFinal: boolean("is_final").notNull().default(false),
  isCancelled: boolean("is_cancelled").notNull().default(false),
}, (t) => [uniqueIndex("order_statuses_code_uq").on(t.code)]);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  counterpartyId: integer("counterparty_id").notNull().references(() => counterparties.id),
  managerId: integer("manager_id").references(() => users.id, { onDelete: "set null" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  /** Второй сотрудник, вместе собиравший заявку: начисления по правилам делятся пополам */
  coUserId: integer("co_user_id").references(() => users.id, { onDelete: "set null" }),
  statusId: integer("status_id").notNull().references(() => orderStatuses.id),
  priceTypeId: integer("price_type_id"),
  deliveryDate: date("delivery_date"),
  discountPct: numeric("discount_pct", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  total: money("total"),
  comment: text("comment").notNull().default(""),
  source: text("source").notNull().default("manual"), // manual|text|voice|copy|lead|api
  copiedFromId: integer("copied_from_id"),
  leadId: integer("lead_id"),
  assemblyStatus: text("assembly_status").notNull().default("none"), // none|assembling|assembled
  assembledById: integer("assembled_by_id"),
  assembledAt: timestamp("assembled_at", { withTimezone: true }),
  assemblyPhotos: jsonb("assembly_photos").$type<FileRef[]>().notNull().default([]),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: deleted(),
}, (t) => [
  uniqueIndex("orders_number_uq").on(t.number),
  index("orders_status_idx").on(t.statusId),
  index("orders_cp_idx").on(t.counterpartyId),
  index("orders_manager_idx").on(t.managerId),
  index("orders_created_idx").on(t.createdAt),
  index("orders_delivery_idx").on(t.deliveryDate),
]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: qty("qty"),
  price: money("price"),
  assembled: boolean("assembled").notNull().default(false),
  sort: integer("sort").notNull().default(0),
}, (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  statusId: integer("status_id").notNull(),
  userId: integer("user_id"),
  comment: text("comment"),
  createdAt: created(),
}, (t) => [index("osh_order_idx").on(t.orderId)]);

/* ───────────── Отгрузки / возвраты ───────────── */

export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  kind: text("kind").notNull().default("shipment"), // shipment|return
  orderId: integer("order_id").references(() => orders.id),
  counterpartyId: integer("counterparty_id").notNull().references(() => counterparties.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  date: date("date").notNull(),
  posted: boolean("posted").notNull().default(true),
  total: money("total"),
  cost: money("cost"),
  comment: text("comment").notNull().default(""),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
}, (t) => [
  uniqueIndex("shipments_kind_number_uq").on(t.kind, t.number),
  index("shipments_order_idx").on(t.orderId),
  index("shipments_cp_idx").on(t.counterpartyId),
  index("shipments_date_idx").on(t.date),
]);

export const shipmentItems = pgTable("shipment_items", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: qty("qty"),
  price: money("price"),
  /** Себестоимость единицы на момент отгрузки */
  cost: money("cost"),
  costEstimated: boolean("cost_estimated").notNull().default(false),
}, (t) => [index("shipment_items_sh_idx").on(t.shipmentId), index("shipment_items_product_idx").on(t.productId)]);

/* ───────────── Приёмки ───────────── */

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  supplierId: integer("supplier_id").notNull().references(() => counterparties.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  date: date("date").notNull(),
  posted: boolean("posted").notNull().default(false),
  total: money("total"),
  supplierDocNumber: text("supplier_doc_number"),
  sourceFile: jsonb("source_file").$type<FileRef | null>(),
  comment: text("comment").notNull().default(""),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
}, (t) => [uniqueIndex("receipts_number_uq").on(t.number), index("receipts_supplier_idx").on(t.supplierId), index("receipts_date_idx").on(t.date)]);

export const receiptItems = pgTable("receipt_items", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: qty("qty"),
  price: money("price"),
  excluded: boolean("excluded").notNull().default(false),
}, (t) => [index("receipt_items_r_idx").on(t.receiptId), index("receipt_items_product_idx").on(t.productId)]);

/* ───────────── Инвентаризация ───────────── */

export const inventories = pgTable("inventories", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  date: date("date").notNull(),
  posted: boolean("posted").notNull().default(false),
  comment: text("comment").notNull().default(""),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  inventoryId: integer("inventory_id").notNull().references(() => inventories.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  expected: qty("expected"),
  actual: qty("actual"),
}, (t) => [index("inventory_items_inv_idx").on(t.inventoryId)]);

/* ───────────── Финансы ───────────── */

export const cashAccounts = pgTable("cash_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("cash"), // cash|kaspi|bank
  active: boolean("active").notNull().default(true),
});

export const finCategories = pgTable("fin_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // income|expense
  code: text("code"), // system: client_payment, supplier_payment, salary
});

export const finTransactions = pgTable("fin_transactions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  kind: text("kind").notNull(), // income|expense|transfer
  accountId: integer("account_id").notNull().references(() => cashAccounts.id),
  toAccountId: integer("to_account_id").references(() => cashAccounts.id),
  categoryId: integer("category_id").references(() => finCategories.id),
  amount: money("amount"),
  comment: text("comment").notNull().default(""),
  paymentId: integer("payment_id"),
  employeeId: integer("employee_id"),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
}, (t) => [index("fin_tx_date_idx").on(t.date), index("fin_tx_account_idx").on(t.accountId), index("fin_tx_payment_idx").on(t.paymentId)]);

/* ───────────── Оплаты ───────────── */

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  direction: text("direction").notNull(), // in (от клиента) | out (поставщику)
  counterpartyId: integer("counterparty_id").notNull().references(() => counterparties.id),
  amount: money("amount"),
  method: text("method").notNull().default("cash"), // cash|kaspi|transfer
  accountId: integer("account_id").references(() => cashAccounts.id),
  date: date("date").notNull(),
  orderId: integer("order_id").references(() => orders.id),
  shipmentId: integer("shipment_id").references(() => shipments.id),
  receiptId: integer("receipt_id").references(() => receipts.id),
  comment: text("comment").notNull().default(""),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
}, (t) => [
  uniqueIndex("payments_dir_number_uq").on(t.direction, t.number),
  index("payments_cp_idx").on(t.counterpartyId),
  index("payments_order_idx").on(t.orderId),
  index("payments_date_idx").on(t.date),
]);

/* ───────────── КП ───────────── */

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  counterpartyId: integer("counterparty_id").references(() => counterparties.id),
  clientName: text("client_name").notNull().default(""),
  clientDetails: text("client_details").notNull().default(""),
  objectName: text("object_name").notNull().default(""),
  priceTypeId: integer("price_type_id"),
  markupPct: numeric("markup_pct", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  validUntil: date("valid_until"),
  terms: text("terms").notNull().default(""),
  isTemplate: boolean("is_template").notNull().default(false),
  templateName: text("template_name"),
  shareToken: text("share_token").notNull(),
  total: money("total"),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
});

export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("шт"),
  qty: qty("qty"),
  /** Базовая цена без наценки */
  basePrice: money("base_price"),
  sort: integer("sort").notNull().default(0),
}, (t) => [index("quote_items_q_idx").on(t.quoteId)]);

/* ───────────── Задачи ───────────── */

export const taskStages = pgTable("task_stages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sort: integer("sort").notNull().default(0),
  isDone: boolean("is_done").notNull().default(false),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  stageId: integer("stage_id").notNull().references(() => taskStages.id),
  assigneeId: integer("assignee_id").notNull().references(() => users.id),
  creatorId: integer("creator_id").notNull().references(() => users.id),
  dueAt: timestamp("due_at", { withTimezone: true }),
  priority: text("priority").notNull().default("normal"), // low|normal|high|urgent
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  orderId: integer("order_id"),
  counterpartyId: integer("counterparty_id"),
  leadId: integer("lead_id"),
  attachments: jsonb("attachments").$type<FileRef[]>().notNull().default([]),
  sort: doublePrecision("sort").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  dueNotifiedAt: timestamp("due_notified_at", { withTimezone: true }),
  overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: deleted(),
}, (t) => [index("tasks_assignee_idx").on(t.assigneeId), index("tasks_stage_idx").on(t.stageId), index("tasks_due_idx").on(t.dueAt)]);

export const taskComments = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull(),
  body: text("body").notNull(),
  mentions: jsonb("mentions").$type<number[]>().notNull().default([]),
  attachments: jsonb("attachments").$type<FileRef[]>().notNull().default([]),
  createdAt: created(),
}, (t) => [index("task_comments_task_idx").on(t.taskId)]);

/* ───────────── Воронка продаж ───────────── */

export const leadStages = pgTable("lead_stages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sort: integer("sort").notNull().default(0),
  kind: text("kind").notNull().default("open"), // open|won|lost
});

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  contactName: text("contact_name").notNull().default(""),
  phone: text("phone"),
  source: text("source").notNull().default(""),
  amount: money("amount"),
  stageId: integer("stage_id").notNull().references(() => leadStages.id),
  managerId: integer("manager_id").references(() => users.id),
  counterpartyId: integer("counterparty_id"),
  orderId: integer("order_id"),
  segment: text("segment").notNull().default("other"),
  comment: text("comment").notNull().default(""),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  staleNotifiedAt: timestamp("stale_notified_at", { withTimezone: true }),
  followUpNotifiedAt: timestamp("follow_up_notified_at", { withTimezone: true }),
  lostReason: text("lost_reason"),
  sort: doublePrecision("sort").notNull().default(0),
  createdAt: created(),
  deletedAt: deleted(),
}, (t) => [index("leads_manager_idx").on(t.managerId), index("leads_stage_idx").on(t.stageId)]);

export const leadEvents = pgTable("lead_events", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  type: text("type").notNull(), // created|stage|comment|call|converted
  text: text("text").notNull().default(""),
  createdAt: created(),
}, (t) => [index("lead_events_lead_idx").on(t.leadId)]);

/* ───────────── Заметки ───────────── */

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  folder: text("folder").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  pinned: boolean("pinned").notNull().default(false),
  visibility: text("visibility").notNull().default("all"), // all|selected|private
  visibleTo: jsonb("visible_to").$type<number[]>().notNull().default([]),
  attachments: jsonb("attachments").$type<FileRef[]>().notNull().default([]),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: deleted(),
});

/* ───────────── Уведомления ───────────── */

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint)]);

/* ───────────── Зарплата ───────────── */

export const paySchemes = pgTable("pay_schemes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  validFrom: date("valid_from").notNull(),
  components: jsonb("components").$type<import("@/modules/payroll/types").PaySchemeComponents>().notNull(),
  comment: text("comment").notNull().default(""),
  createdBy: integer("created_by"),
  createdAt: created(),
}, (t) => [index("pay_schemes_user_idx").on(t.userId, t.validFrom)]);

export const accrualRules = pgTable("accrual_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  authorMatch: text("author_match").notNull().default("user"), // user|sales_manager|any
  authorUserId: integer("author_user_id"),
  recipientMode: text("recipient_mode").notNull().default("user"), // author|user|manager
  recipientUserId: integer("recipient_user_id"),
  rateBp: integer("rate_bp").notNull(), // 100 = 1%
  base: text("base").notNull().default("order_total"), // order_total|shipment_revenue|profit
  moment: text("moment").notNull().default("order_created"), // order_created|shipment|paid
  segment: text("segment"), // null = любые
  active: boolean("active").notNull().default(true),
  validFrom: date("valid_from"),
  createdAt: created(),
});

export const payrollAccruals = pgTable("payroll_accruals", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull(),
  orderId: integer("order_id").notNull(),
  /** main | return:<shipmentId> */
  kind: text("kind").notNull().default("main"),
  recipientId: integer("recipient_id").notNull(),
  authorId: integer("author_id").notNull(),
  baseAmount: money("base_amount"),
  rateBp: integer("rate_bp").notNull(),
  amount: money("amount"),
  status: text("status").notNull().default("pending"), // pending|confirmed|cancelled
  accrualDate: date("accrual_date").notNull(),
  note: text("note").notNull().default(""),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("accrual_rule_order_kind_uq").on(t.ruleId, t.orderId, t.kind),
  index("accrual_recipient_idx").on(t.recipientId, t.accrualDate),
]);

export const payrollAdjustments = pgTable("payroll_adjustments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: date("date").notNull(),
  type: text("type").notNull(), // bonus|penalty|weekend|overtime
  amount: money("amount"),
  hours: numeric("hours", { precision: 6, scale: 2, mode: "number" }),
  comment: text("comment").notNull().default(""),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
}, (t) => [index("payroll_adj_user_idx").on(t.userId, t.date)]);

export const timesheet = pgTable("timesheet", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: date("date").notNull(),
  status: text("status").notNull(), // present|absent|vacation|sick|dayoff
  hours: numeric("hours", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  checkIn: timestamp("check_in", { withTimezone: true }),
  checkOut: timestamp("check_out", { withTimezone: true }),
  authorId: integer("author_id"),
}, (t) => [uniqueIndex("timesheet_user_date_uq").on(t.userId, t.date)]);

export const payrollAdvances = pgTable("payroll_advances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  periodKey: text("period_key").notNull(),
  date: date("date").notNull(),
  amount: money("amount"),
  accountId: integer("account_id"),
  finTxId: integer("fin_tx_id"),
  comment: text("comment").notNull().default(""),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
});

export const payrollPayouts = pgTable("payroll_payouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  periodKey: text("period_key").notNull(),
  date: date("date").notNull(),
  amount: money("amount"),
  accountId: integer("account_id"),
  finTxId: integer("fin_tx_id"),
  comment: text("comment").notNull().default(""),
  authorId: integer("author_id").notNull(),
  createdAt: created(),
  deletedAt: deleted(),
});

export const payrollPeriods = pgTable("payroll_periods", {
  id: serial("id").primaryKey(),
  periodKey: text("period_key").notNull(),
  start: date("start").notNull(),
  end: date("end").notNull(),
  closed: boolean("closed").notNull().default(false),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: integer("closed_by"),
  /** Снимок расчётных листов на момент закрытия */
  snapshot: jsonb("snapshot"),
}, (t) => [uniqueIndex("payroll_periods_key_uq").on(t.periodKey)]);

/* ───────────── KPI ───────────── */

export const kpiTargets = pgTable("kpi_targets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  metric: text("metric").notNull(), // revenue|orders|tasks_done|tasks_on_time_pct|leads_won
  period: text("period").notNull().default("month"), // week|month
  target: bigint("target", { mode: "number" }).notNull(),
});

/* ───────────── Интеграции ───────────── */

export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull(),
  permissions: jsonb("permissions").$type<import("@/lib/rbac").Permissions>().notNull(),
  /** От чьего имени выполняются действия */
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [uniqueIndex("api_tokens_hash_uq").on(t.tokenHash)]);

export const mcpCallLog = pgTable("mcp_call_log", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id"),
  tool: text("tool").notNull(),
  args: jsonb("args"),
  ok: boolean("ok").notNull(),
  error: text("error"),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: created(),
});

export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
  lastStatus: integer("last_status"),
  lastCalledAt: timestamp("last_called_at", { withTimezone: true }),
  createdAt: created(),
});

/** Счётчики номеров документов */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});
