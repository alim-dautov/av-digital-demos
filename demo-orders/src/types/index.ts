export type UserRole =
  | "OWNER"
  | "DIRECTOR"
  | "MANAGER"
  | "MASTER"
  | "DRIVER"
  | "DESIGNER"
  | "TECHNOLOGIST"
  | "ADMIN"
  | "WORKSHOP"
  | "SEAMSTRESS"
  | "MOBILOGRAPHER";

/** Per-user module access on top of the role. Mirrors `Resource` from lib/rbac. */
export type AccessLevel = "none" | "read" | "write";
export type AccessOverrides = Partial<Record<string, AccessLevel>>;

/** Explicit grants that are not tied to a module access level. */
export interface UserPermissions {
  deleteOrders?: boolean;
}

export type CompanyStatus = "active" | "coming_soon";

export type CompanyVertical = "furniture" | "textiles";

export type OrderStatus =
  | "lead"
  | "application"
  | "contract"
  | "approval"
  | "production"
  | "installation"
  | "closed";

/** Order statuses for Шторы Демо (textiles) */
export type AtelierOrderStatus =
  | "draft"
  | "measurement"
  | "awaiting"
  | "in_work"
  | "completed"
  | "cancelled";

/** Statuses used before the workshop flow; migrated on startup. */
export type LegacyAtelierOrderStatus =
  | "new"
  | "in_progress"
  | "production"
  | "ready"
  | "installed";

export type AnyOrderStatus = OrderStatus | AtelierOrderStatus;

export type BuiltinStageKey =
  | "cutting"
  | "edging"
  | "drilling"
  | "assembly"
  | "painting"
  | "multicam"
  | "vacuum"
  | "installation"
  | "done";

/** Built-in stage or a company-defined one from the production funnel settings. */
export type ProductionStageKey = BuiltinStageKey | `custom_${string}`;

/** One step of the company's production funnel (Настройки → Воронка производства). */
export interface FunnelStage {
  key: ProductionStageKey;
  label: string;
}

/** What the assigned workers (сборщики, водители) see in an order. Absent = defaults. */
export interface OrderWorkerVisibility {
  amount: boolean;
  clientName: boolean;
  clientPhone: boolean;
  address: boolean;
  deadline: boolean;
  materials: boolean;
  media: boolean;
  comments: boolean;
  stages: boolean;
}

export type StageStatus = "pending" | "in_progress" | "done" | "blocked";

export type LeadSource =
  | "instagram"
  | "website"
  | "referral"
  | "2gis"
  | "repeat"
  | "other";

export type InventoryCategory =
  | "hardware"
  | "sheet"
  | "consumables"
  | "machine"
  | "fabric_portiere"
  | "fabric_tulle"
  | "sewing_hardware"
  | "cornice"
  | "roman_mechanism";

export type MovementType = "in" | "out" | "transfer" | "adjustment";

export type CompensationType =
  | "percentage"
  | "fixed"
  | "from_profit"
  | "percentage_projects";

export type TaskStatus = "todo" | "in_progress" | "done" | "overdue";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type NotificationType =
  | "new_order"
  | "status_change"
  | "task_assigned"
  | "task_overdue"
  | "lateness"
  | "low_stock"
  | "new_report"
  | "new_advance"
  | "stage_change"
  | "sewing_order"
  | "workshop_new"
  | "workshop_accepted"
  | "workshop_cancelled"
  | "assistant"
  | "test";

export interface Company {
  id: string;
  name: string;
  tagline: string;
  logoUrl?: string | null;
  disabledModules?: string[];
  status: CompanyStatus;
  currency: string;
  timezone: string;
  vertical: CompanyVertical;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface EntityNote {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  authorId: string | null;
  authorName: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  login: string | null;
  fullName: string;
  firstName: string;
  role: UserRole;
  access: AccessOverrides | null;
  permissions: UserPermissions | null;
  companyId: string;
  disabledModules?: string[];
  employeeId: string | null;
  avatarUrl: string | null;
}

export interface Employee {
  id: string;
  companyId: string;
  fullName: string;
  firstName: string;
  phone: string;
  position: string;
  role: UserRole;
  status: "active" | "vacation" | "fired";
  hireDate: string;
  compensationType: CompensationType;
  percentage: number | null;
  fixedSalary: number | null;
  photoUrl: string | null;
  isMeasurer?: boolean;
  /** Руководитель: его пользователь видит зарплату и авансы этого сотрудника. */
  supervisorId?: string | null;
  /** Личный максимум аванса в % от заработка; null — общий из настроек. */
  advanceMaxPercent?: number | null;
}

export interface Client {
  id: string;
  companyId: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  source: LeadSource;
  /** Свой вариант, если источник — «Другое» */
  sourceNote?: string | null;
  firstContactAt: string;
  comment: string | null;
  ordersCount: number;
  totalAmount: number;
  lastOrderAt: string | null;
  address?: string | null;
  photos?: MediaItem[];
  notes?: EntityNote[];
}

export interface OrderPayment {
  id: string;
  date: string;
  amount: number;
  comment: string | null;
  cashEntryId: string | null;
}

export interface Order {
  id: string;
  companyId: string;
  number: string;
  clientId: string;
  source: LeadSource;
  sourceNote?: string | null;
  /** Сумма предоплаты. Остаток = amount − prepayment − оплаты. */
  prepayment?: number;
  payments?: OrderPayment[];
  /** Когда сформирован заказ в цех на пошив */
  sewingOrderAt?: string | null;
  /** Комнаты, переданные в цех. Пусто — в цехе весь расчёт. */
  sewingRoomIds?: string[] | null;
  status: AnyOrderStatus;
  amount: number;
  cost: number;
  profit: number;
  date: string;
  deadline: string;
  responsibleId: string | null;
  masterId: string | null;
  /** All assigned masters (up to two); masterId mirrors the first for legacy consumers. */
  masterIds?: string[];
  closedAt?: string | null;
  description: string;
  comment: string | null;
  furnitureUnits: number;
  materialsNote: string | null;
  hardwareNote: string | null;
  media: MediaItem[];
  createdAt: string;
  updatedAt: string;
  /** Textiles quote snapshot (Шторы Демо) */
  atelierQuote?: AtelierStoredQuote | null;
  /** Cabinet furniture quote snapshot (Mebel Demo) */
  furnitureQuote?: FurnitureQuoteSnapshot | null;
  /** Renovation / construction quote snapshot (Компания 3) */
  renovationQuote?: RenovationQuoteSnapshot | null;
  orderNotes?: EntityNote[];
  address?: string | null;
  proposalId?: string | null;
  statusHistory?: OrderStatusChange[];
  /** Seamstress who took the order from the workshop queue */
  acceptedBy?: { userId: string; name: string } | null;
  acceptedAt?: string | null;
  /** When the order was withdrawn from the workshop */
  cancelledAt?: string | null;
  /** Soft deletion: hidden from work lists, kept for finance and cash history */
  deletedAt?: string | null;
  deletedBy?: { userId: string; name: string } | null;
  /** Что видят назначенные рабочие; отсутствует — значения по умолчанию. */
  workerVisibility?: OrderWorkerVisibility | null;
  /** Actual production materials entered by the workshop; never affects quote prices. */
  productionMaterials?: ProductionMaterial[];
  /** Workshop-only operational note. Commercial comments remain separate. */
  productionComment?: string | null;
}

export interface ProductionMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  comment: string | null;
}

export interface OrderStatusChange {
  status: AnyOrderStatus;
  /** Status before the change; null for the first entry */
  from: AnyOrderStatus | null;
  at: string;
  actorId: string | null;
  actorName: string;
}

export type ExpenseCategoryKey = "materials" | "delivery" | "labor" | "other" | string;

export interface ExpenseCategory {
  id: string;
  companyId: string;
  /** Stable key stored on expenses */
  key: string;
  label: string;
  system: boolean;
  createdAt: string;
}

/** Actual cost line of an order. Calculator lines keep the planned amount separately. */
export interface OrderExpense {
  id: string;
  companyId: string;
  orderId: string;
  category: ExpenseCategoryKey;
  name: string;
  amount: number;
  /** Amount from the calculator at the last sync; null for manual lines */
  plannedAmount: number | null;
  note: string | null;
  source: "calculator" | "manual";
  /** Stable key of the calculator line, unique per order */
  sourceKey: string | null;
  quoteCalculatedAt: string | null;
  /** Amount changed by hand; sync then keeps it */
  edited: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  companyId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  type: "photo" | "video" | "file";
  url: string;
  name: string;
  createdAt: string;
  /** Atelier calculator room the photo belongs to */
  roomId?: string | null;
  /** Order or measurement photo this client-card copy came from */
  sourceMediaId?: string | null;
}

export interface OrderStage {
  id: string;
  companyId: string;
  orderId: string;
  key: ProductionStageKey;
  label: string;
  sortOrder: number;
  status: StageStatus;
  responsibleId: string | null;
  startDate: string | null;
  endDate: string | null;
  durationHours: number | null;
  comment: string | null;
  media: MediaItem[];
}

export interface ChecklistItem {
  id: string;
  companyId: string;
  orderId: string;
  category: "material" | "hardware" | "qc" | "other";
  name: string;
  quantity: number;
  unit: string;
  done: boolean;
  responsibleId: string | null;
  comment: string | null;
}

export interface Material {
  /** Archived warehouse entry; historical references remain intact. */
  deletedAt?: string | null;
  id: string;
  companyId: string;
  category: InventoryCategory;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  minStock: number;
  unitCost: number;
  attributes?: Record<string, string>;
}

export interface InventoryMovement {
  id: string;
  companyId: string;
  materialId: string;
  type: MovementType;
  quantity: number;
  unit: string;
  date: string;
  responsibleId: string | null;
  orderId: string | null;
  comment: string | null;
  unitCost?: number;
  receiptId?: string | null;
  attributes?: Record<string, string>;
}

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  orderId: string | null;
  stageId: string | null;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  system: boolean;
  createdAt: string;
}

export interface EmployeeReport {
  id: string;
  companyId: string;
  orderId: string;
  stageId: string | null;
  employeeId: string;
  whatDone: string;
  problems: string | null;
  materials: string | null;
  unitsDone: number;
  comment: string | null;
  media: MediaItem[];
  createdAt: string;
}

export interface Attendance {
  id: string;
  companyId: string;
  employeeId: string;
  date: string;
  checkInAt: string;
  lateMinutes: number;
  penaltyAmount: number;
  qrTokenId: string;
  location: string;
}

export interface AttendanceQR {
  id: string;
  companyId: string;
  token: string;
  expiresAt: string;
  usedAt: string | null;
  employeeId: string | null;
  location: string;
  createdAt: string;
}

export interface SalaryRecord {
  id: string;
  companyId: string;
  employeeId: string;
  orderId: string | null;
  period: string;
  baseAmount: number;
  bonus: number;
  penalties: number;
  advances: number;
  netAmount: number;
  status: "pending" | "paid";
}

/** Факт выдачи зарплаты на руки (в отличие от начисления SalaryRecord). */
export interface SalaryPayment {
  id: string;
  companyId: string;
  employeeId: string;
  amount: number;
  date: string;
  comment: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = "cash" | "cashless";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличные",
  cashless: "Безналичные",
};

export interface Advance {
  id: string;
  companyId: string;
  employeeId: string;
  orderId: string | null;
  amount: number;
  maxAllowed: number;
  date: string;
  comment: string | null;
  authorId: string;
  status: "issued" | "deducted";
  paymentMethod: PaymentMethod;
  receipt: MediaItem | null;
}

export interface Penalty {
  id: string;
  companyId: string;
  employeeId: string;
  reason: string;
  amount: number;
  date: string;
  comment: string | null;
  authorId: string;
  status: "active" | "cancelled";
  auto: boolean;
}

export interface CompanySettings {
  companyId: string;
  workStart: string;
  workEnd: string;
  workDays: number[];
  lateThresholdMinutes: number;
  latePenaltyAmount: number;
  advanceMaxPercent: number;
  defaultAssemblerPercent: number;
  qrRotateSeconds: number;
  /** Воронка производства; отсутствует — встроенные этапы. */
  productionStages?: FunnelStage[] | null;
}

export interface Notification {
  id: string;
  companyId: string;
  userId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
  /** Same key is never stored twice */
  dedupeKey?: string | null;
}

export type NotificationPreferenceKey =
  | "workshop"
  | "orders"
  | "tasks"
  | "payroll"
  | "system";

export interface UserSettings {
  userId: string;
  companyId: string;
  notifications: Record<NotificationPreferenceKey, boolean>;
  updatedAt: string;
}

export interface OrderAuditLog {
  id: string;
  companyId: string;
  orderId: string;
  actorId: string;
  actorName: string;
  field: string;
  previousValue: string | number | boolean | null;
  nextValue: string | number | boolean | null;
  reason: string | null;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  companyId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface CalculatorProject {
  id: string;
  companyId: string;
  clientId: string | null;
  name: string;
  furnitureType: string;
  width: number;
  height: number;
  depth: number;
  quantity: number;
  materialCost: number;
  laborCost: number;
  hardwareCost: number;
  facadeCost: number;
  extrasCost: number;
  installCost: number;
  deliveryCost: number;
  markupPercent: number;
  total: number;
  createdAt: string;
}

export interface CommercialProposal {
  id: string;
  companyId: string;
  calculatorId: string;
  clientId: string | null;
  number: string;
  items: { name: string; qty: number; specs: string; price: number }[];
  total: number;
  terms: string;
  deadlineDays: number;
  createdAt: string;
  /** Optional link to textiles order */
  orderId?: string | null;
  discountPercent?: number;
  subtotalBeforeDiscount?: number;
  kind?: "furniture" | "textiles" | "renovation";
  /** Textiles calculation frozen at creation, limited to the selected rooms */
  quoteSnapshot?: AtelierStoredQuote | null;
  /** Renovation calculation frozen at creation */
  renovationSnapshot?: RenovationQuoteSnapshot | null;
  /** Rooms of the order included in this KP */
  roomIds?: string[];
  clientName?: string | null;
  clientPhone?: string | null;
  address?: string | null;
  orderNumber?: string | null;
  discountAmount?: number;
  /** Room photos frozen into this proposal */
  photos?: { id: string; url: string; name: string; roomId?: string | null }[];
}

/* ─── Шторы Демо catalog & quote ─── */

export type AtelierCorniceKind =
  | "ceiling_plastic_1"
  | "ceiling_plastic_2"
  | "ceiling_plastic_3"
  | "aluminum_1"
  | "aluminum_2"
  | "aluminum_3"
  | "simple_1"
  | "simple_2"
  | "simple_3"
  | "forged";

export type AtelierForgedColor =
  | "gold"
  | "bronze"
  | "white"
  | "black"
  | "chrome"
  | "satin";

export interface AtelierCornicePrice {
  id: string;
  companyId: string;
  kind: AtelierCorniceKind;
  label: string;
  forgedColor: AtelierForgedColor | null;
  rows: 1 | 2 | 3 | null;
  salePricePerMeter: number;
  costPricePerMeter: number;
  active: boolean;
}

export interface AtelierFabric {
  id: string;
  companyId: string;
  name: string;
  type: "portiere" | "tulle";
  article: string;
  salePrice: number;
  costPrice: number;
  unit: string;
  metrage: number;
  stock: number;
  minStock: number;
  description: string;
  materialId: string | null;
  active: boolean;
}

export interface AtelierAssemblyCoeff {
  id: string;
  companyId: string;
  value: number;
  label: string;
  active: boolean;
}

export interface AtelierCoverPrice {
  id: string;
  companyId: string;
  stitch: "romb" | "square" | "stripe";
  corner: "sharp" | "round";
  coverType: "single" | "one_bed" | "double" | "custom";
  salePrice: number;
  costPrice: number;
  active: boolean;
}

export interface AtelierPillowPrice {
  id: string;
  companyId: string;
  pillowType: "cover" | "full";
  salePrice: number;
  costPrice: number;
  active: boolean;
}

export interface AtelierAccessoryPrice {
  id: string;
  companyId: string;
  kind: "side_hooks" | "fabric_tiebacks" | "decorative_tassels" | "rings";
  label: string;
  color: "gold" | "bronze" | "chrome" | "white";
  salePrice: number;
  costPrice: number;
  active: boolean;
}

export interface AtelierRollerPrice {
  id: string;
  companyId: string;
  panel: "solid" | "day_night";
  mount: "wall" | "ceiling" | "sash";
  mechanismColor: "white" | "gold_oak" | "brown" | "grey";
  salePricePerSqm: number;
  costPricePerSqm: number;
  active: boolean;
}

export interface AtelierInstallPrice {
  id: string;
  companyId: string;
  section:
    | "cornice"
    | "curtains"
    | "covers"
    | "pillows"
    | "accessories"
    | "rollers";
  label: string;
  salePrice: number;
  costPrice: number;
  active: boolean;
}

export interface AtelierInstallLine {
  price: number;
  cost: number;
  showInKp: boolean;
}

export interface AtelierCorniceLine {
  id: string;
  priceId: string;
  kind: AtelierCorniceKind;
  label: string;
  forgedColor: AtelierForgedColor | null;
  meters: number;
  salePerMeter: number;
  costPerMeter: number;
  lineTotal: number;
  lineCost: number;
  install: AtelierInstallLine;
}

/** Legacy flat-quote curtain line; migrated into `AtelierFabricLine` on read. */
export interface AtelierCurtainLine {
  id: string;
  width: number;
  height: number;
  fabricId: string | null;
  fabricName: string;
  fabricType: "portiere" | "tulle" | null;
  assemblyCoeff: number;
  showCoeffInKp: boolean;
  metersNeeded: number;
  salePerMeter: number;
  costPerMeter: number;
  lineTotal: number;
  lineCost: number;
  install: AtelierInstallLine;
}

/** Legacy flat-quote sewing line; migrated into `AtelierFabricLine.sewing` on read. */
export interface AtelierSewingLine {
  id: string;
  name: string;
  /** Linked curtain line — source of linear meters */
  curtainId: string | null;
  linearMeters: number;
  linearMetersManual: boolean;
  /** "fixed" keeps legacy lines priced by a flat sum */
  pricing: "per_meter" | "fixed";
  ratePerMeter: number;
  costPerMeter: number;
  mountingTape: boolean;
  tapeRatePerMeter: number;
  tapeCostPerMeter: number;
  tapePrice: number;
  tapeCost: number;
  price: number;
  cost: number;
}

export type AtelierFabricKind = "tulle" | "portiere";

export interface AtelierFabricSewing {
  /** "fixed" keeps legacy lines priced by a flat sum */
  pricing: "per_meter" | "fixed";
  /** Defaults to fabric consumption until edited */
  meters: number;
  metersManual: boolean;
  ratePerMeter: number;
  costPerMeter: number;
  price: number;
  cost: number;
}

export interface AtelierMountingTape {
  enabled: boolean;
  /** Defaults to fabric consumption until edited */
  meters: number;
  metersManual: boolean;
  ratePerMeter: number;
  costPerMeter: number;
  price: number;
  cost: number;
}

export interface AtelierExtraLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  salePerUnit: number;
  costPerUnit: number;
  lineTotal: number;
  lineCost: number;
}

/** Люверсы и петли: количество × цена */
export interface AtelierPieceCharge {
  quantity: number;
  salePerUnit: number;
  costPerUnit: number;
  price: number;
  cost: number;
}

export type AtelierMeterageMode = "legacy" | "width_coeff";

export interface AtelierFabricLine {
  id: string;
  /** Reference window size for the KP; does not drive consumption */
  width: number;
  height: number;
  fabricId: string | null;
  fabricName: string;
  /** Linear meters entered by the user */
  meterage: number;
  coeffEnabled: boolean;
  assemblyCoeff: number;
  showCoeffInKp: boolean;
  /** meterage × effective coefficient */
  metersNeeded: number;
  salePerMeter: number;
  costPerMeter: number;
  lineTotal: number;
  lineCost: number;
  sewing: AtelierFabricSewing;
  tape: AtelierMountingTape;
  extras: AtelierExtraLine[];
  /** legacy: метраж × коэффициент. width_coeff: метраж = ширина × коэффициент */
  meterageMode?: AtelierMeterageMode;
  /** Ширина введена вручную и не перезаписывается карнизом */
  widthManual?: boolean;
  /** От чего мерили высоту */
  heightFrom?: string;
  /** Разрез */
  cut?: string;
  cutNote?: string;
  /** Комментарий / заметки по позиции */
  note?: string;
  grommets?: AtelierPieceCharge;
  loops?: AtelierPieceCharge;
  install: AtelierInstallLine;
  /** Fabric + sewing + tape + extras + install */
  total: number;
  totalCost: number;
}

export type AtelierBlindKind = "wood" | "aluminum" | "bamboo";

export interface AtelierBlindLine {
  id: string;
  kind: AtelierBlindKind;
  width: number;
  height: number;
  sqm: number;
  salePerSqm: number;
  costPerSqm: number;
  lineTotal: number;
  lineCost: number;
  install: AtelierInstallLine;
  note?: string;
}

export type AtelierVisibleSection =
  | "tulle"
  | "portiere"
  | "covers"
  | "pillows"
  | "accessories"
  | "rollers";

export interface AtelierRoom {
  id: string;
  name: string;
  tulle: AtelierFabricLine[];
  portiere: AtelierFabricLine[];
  cornices: AtelierCorniceLine[];
  covers: AtelierCoverLine[];
  pillows: AtelierPillowLine[];
  accessories: AtelierAccessoryLine[];
  rollers: AtelierRollerLine[];
  blinds?: AtelierBlindLine[];
  /** Идентификаторы из справочника видов штор. Список справочника расширяется без миграции. */
  curtainStyleIds?: string[];
  /** Нет поля — показывать все блоки (старые расчёты). Пустой список — только выбранные. */
  visibleSections?: AtelierVisibleSection[];
  subtotal: number;
  totalCost: number;
}

export type AtelierLabelKey =
  | "install.cornice"
  | "install.curtains"
  | "install.covers"
  | "install.pillows"
  | "install.accessories"
  | "install.rollers"
  | "sewing.title"
  | "sewing.tape"
  | "sewing.linearMeters";

export type AtelierLabels = Record<AtelierLabelKey, string>;

export interface AtelierLabelsRecord {
  companyId: string;
  labels: AtelierLabels;
  updatedAt: string;
}

export interface AtelierServicePrices {
  companyId: string;
  sewingSalePerMeter: number;
  sewingCostPerMeter: number;
  tapeSalePerMeter: number;
  tapeCostPerMeter: number;
}

export interface AtelierCoverLine {
  id: string;
  width: number;
  length: number;
  overhang: number;
  stitch: "romb" | "square" | "stripe";
  corner: "sharp" | "round";
  coverType: "single" | "one_bed" | "double" | "custom";
  salePrice: number;
  costPrice: number;
  lineTotal: number;
  lineCost: number;
  install: AtelierInstallLine;
  materialKind?: "sintepon" | "fabric" | null;
  materialName?: string;
  materialId?: string | null;
  materialMeterage?: number;
  materialSalePerMeter?: number;
  materialCostPerMeter?: number;
  sewing?: AtelierFabricSewing;
  /** Ручная цена пошива. Пустое поле хранится как 0 и входит в сумму. */
  sewingPrice?: number;
}

export interface AtelierPillowLine {
  id: string;
  width: number;
  height: number;
  pillowType: "cover" | "full";
  quantity: number;
  note: string;
  salePrice: number;
  costPrice: number;
  lineTotal: number;
  lineCost: number;
  install: AtelierInstallLine;
  materialKind?: "sintepon" | "fabric" | null;
  materialName?: string;
  materialMeterage?: number;
  materialSalePerMeter?: number;
  materialCostPerMeter?: number;
  fillingName?: string;
  fillingQty?: number;
  fillingSale?: number;
  fillingCost?: number;
  /** Цена пошива за одну подушку */
  sewPillow?: number;
  sewPillowCost?: number;
  /** Цена пошива за одну наволочку */
  sewCase?: number;
  sewCaseCost?: number;
  /** Цена пошива за один полный комплект */
  sewSet?: number;
  sewSetCost?: number;
  /** Общая строка «Пошив», если не разбита на подушку / наволочку / комплект */
  sewingPrice?: number;
}

export interface AtelierAccessoryLine {
  id: string;
  kind: "side_hooks" | "fabric_tiebacks" | "decorative_tassels" | "rings";
  label: string;
  color: "gold" | "bronze" | "chrome" | "white";
  quantity: number;
  salePrice: number;
  costPrice: number;
  lineTotal: number;
  lineCost: number;
  install: AtelierInstallLine;
}

export interface AtelierRollerLine {
  id: string;
  width: number;
  height: number;
  panel: "solid" | "day_night";
  mount: "wall" | "ceiling" | "sash";
  mechanismColor: "white" | "gold_oak" | "brown" | "grey";
  sqm: number;
  salePerSqm: number;
  costPerSqm: number;
  lineTotal: number;
  lineCost: number;
  install: AtelierInstallLine;
}

export interface AtelierQuoteSnapshot {
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  address: string;
  deadline: string;
  /** YYYY-MM-DD */
  measurementDate?: string | null;
  /** Комментарий к заказу: виден в цеху и печатается в заказе на пошив */
  orderComment?: string;
  leadSource?: LeadSource | null;
  leadSourceNote?: string;
  rooms: AtelierRoom[];
  discountPercent: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  calculatedAt: string | null;
  /** 2 = all sizes in meters; absent = legacy centimeters */
  unitsVersion?: 2;
  /** Work/stage names frozen at save time */
  labels?: AtelierLabels;
}

/** Pre-rooms snapshot shape, still present in stored orders and proposals. */
export interface AtelierLegacyQuoteFields {
  cornices?: AtelierCorniceLine[];
  curtains?: AtelierCurtainLine[];
  sewings?: AtelierSewingLine[];
  covers?: AtelierCoverLine[];
  pillows?: AtelierPillowLine[];
  accessories?: AtelierAccessoryLine[];
  rollers?: AtelierRollerLine[];
}

export type AtelierStoredQuote = Omit<AtelierQuoteSnapshot, "rooms"> & {
  rooms?: AtelierRoom[];
} & AtelierLegacyQuoteFields;

/* ─── Measurements calendar ─── */

export type MeasurementStatus = "planned" | "done" | "cancelled";

export interface Measurement {
  id: string;
  companyId: string;
  clientId: string;
  orderId: string | null;
  measurerId: string;
  date: string;
  startTime: string;
  durationMin: number;
  address: string;
  status: MeasurementStatus;
  comment: string | null;
  createdAt: string;
}

/** Calculator measurement saved on a client. Not a calendar appointment. */
export interface ClientMeasurementPhoto {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface ClientMeasurement {
  id: string;
  companyId: string;
  clientId: string;
  number: string;
  address: string;
  quote: AtelierQuoteSnapshot;
  kind: "draft" | "sheet";
  photos: ClientMeasurementPhoto[];
  createdAt: string;
  updatedAt: string;
}

/* ─── Gallery ─── */

export interface GalleryFolder {
  id: string;
  companyId: string;
  name: string;
  system: boolean;
  createdAt: string;
}

export interface GalleryPhoto {
  id: string;
  companyId: string;
  folderId: string;
  url: string;
  name: string;
  clientId: string | null;
  orderId: string | null;
  createdAt: string;
}

/* ─── Mebel Demo furniture calculator ─── */

export type FurniturePriceCategory =
  | "ldsp"
  | "mdf_sheet"
  | "facade_sqm"
  | "hdf"
  | "edge"
  | "service"
  | "hinge"
  | "slide"
  | "lift"
  | "accessory"
  | "countertop";

export type FurniturePriceUnit = "sheet" | "sqm" | "m" | "pcs";

export interface FurniturePriceItem {
  id: string;
  companyId: string;
  /** Stable key used by the calculator (e.g. "ldsp_lamarty", "transport") */
  code: string;
  category: FurniturePriceCategory;
  name: string;
  unit: FurniturePriceUnit;
  sheetWidth: number | null;
  sheetHeight: number | null;
  price: number;
  sortOrder: number;
  active: boolean;
}

export type FurnitureModuleKind = "base" | "wall" | "mezzanine" | "tall";

export type FurnitureBaseVariant = "doors" | "drawers2" | "drawers3";

export type FurnitureFacadeMaterial =
  | "none"
  | "ldsp"
  | "egger"
  | "mdf_film"
  | "mdf_paint"
  | "mdf_multicam"
  | "mdf_fluted"
  | "veneer_1"
  | "veneer_2";

export type FurnitureCountertop = "none" | "ldsp" | "manual";

/** Calculation approach for a furniture quote. Legacy quotes are treated as detailed. */
export type FurnitureCalculationMode = "quick" | "detailed";

export type FurnitureQuickTariff = "ldsp_budget" | "ldsp_standard" | "mdf_paint";

/** Inputs for the client-facing running-meter estimate. */
export interface FurnitureQuickEstimate {
  linearMeters: number;
  heightMeters: number;
  tariff: FurnitureQuickTariff;
}

export interface FurnitureModule {
  id: string;
  kind: FurnitureModuleKind;
  variant: FurnitureBaseVariant;
  width: number;
  height: number;
  depth: number;
  quantity: number;
  /** Own client price per unit; replaces the calculated one. */
  price?: number | null;
  /** Offset of the left edge along the wall, mm; null packs automatically. */
  x?: number | null;
}

export interface FurnitureRoom {
  length: number;
  height: number;
  depth: number;
}

export interface FurnitureModulePrice {
  /** Per unit, from cost × coefficient */
  calculated: number;
  /** Per unit, what the client pays */
  price: number;
}

export interface FurnitureExtraLine {
  id: string;
  priceItemId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
}

export type FurnitureCountKey =
  | "hdfSheets"
  | "countertopSheets"
  | "hinges"
  | "slides"
  | "legs"
  | "crabs"
  | "edgeMeters";

export interface FurnitureOverrides {
  counts: Partial<Record<FurnitureCountKey, number>>;
  /** Manual LDSP sheet count per material (price item id) */
  sheets: Record<string, number>;
}

export interface FurniturePart {
  moduleId: string;
  moduleLabel: string;
  name: string;
  /** Dimension along the sheet grain, mm */
  length: number;
  width: number;
  quantity: number;
  /** Price item id of the sheet material */
  materialId: string;
  isFacade: boolean;
  /** Banded edge length for one piece, mm */
  edge: number;
  /** Which sides are banded, e.g. "кромка: 2×476" */
  edgeNote?: string;
}

export interface FurnitureFacadePiece {
  moduleId: string;
  height: number;
  width: number;
  quantity: number;
}

export interface NestedPlacement {
  name: string;
  moduleLabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  isFacade: boolean;
}

export interface NestedSheet {
  materialId: string;
  width: number;
  height: number;
  placements: NestedPlacement[];
  utilization: number;
}

export interface FurnitureCostLine {
  key: string;
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface FurnitureQuoteResult {
  kitchenLength: number;
  wardrobeWidth: number;
  baseRunLength: number;
  parts: FurniturePart[];
  facades: FurnitureFacadePiece[];
  facadeAreaSqm: number;
  sheets: NestedSheet[];
  /** Nested sheet count per material id */
  nestedSheetCounts: Record<string, number>;
  /** Auto-calculated counts before overrides */
  autoCounts: Record<FurnitureCountKey, number>;
  /** Final counts after overrides */
  counts: Record<FurnitureCountKey, number>;
  costLines: FurnitureCostLine[];
  /** Per module id */
  modulePrices: Record<string, FurnitureModulePrice>;
  warnings: string[];
}

/** One selectable line inside a renovation block (Компания 3). */
export interface RenovationItemLine {
  id: string;
  enabled: boolean;
  comment: string;
  price: number;
}

/** Block groups items; price lives on items. */
export interface RenovationBlockLine {
  id: string;
  items: RenovationItemLine[];
}

export interface RenovationQuoteSnapshot {
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  address: string;
  projectName: string;
  deadline: string;
  blocks: RenovationBlockLine[];
  total: number;
  calculatedAt: string | null;
}

export interface FurnitureQuoteSnapshot {
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  address: string;
  deadline: string;
  projectName: string;
  /** New quotes open in quick mode; missing on legacy saved quotes means detailed mode. */
  calculationMode?: FurnitureCalculationMode;
  quickEstimate?: FurnitureQuickEstimate;
  modules: FurnitureModule[];
  carcassMaterialId: string;
  facadeMaterial: FurnitureFacadeMaterial;
  facadeSheetMaterialId: string | null;
  eggerFacadeCost: number;
  countertop: FurnitureCountertop;
  countertopManualCost: number;
  hingeItemId: string | null;
  slideItemId: string | null;
  allowRotation: boolean;
  includeTransport: boolean;
  extras: FurnitureExtraLine[];
  overrides: FurnitureOverrides;
  coefficient: number;
  discountPercent: number;
  /** 3D editor only; does not affect price. */
  room?: FurnitureRoom;
  /** Visual preset keys for the 3D editor; do not affect price. */
  facadeColor?: string;
  carcassColor?: string;
  result: FurnitureQuoteResult | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  calculatedAt: string | null;
}

export interface UserAccount {
  id: string;
  companyId: string;
  email: string;
  /** Short login; sign-in accepts it or the email */
  login?: string | null;
  passwordHash: string;
  fullName: string;
  firstName: string;
  role: UserRole;
  employeeId: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  access?: AccessOverrides | null;
  permissions?: UserPermissions | null;
  /** Personal notification preferences; absent means everything on. */
  notificationPrefs?: NotificationPrefs | null;
  /** Incremented to revoke all existing JWTs after password/access changes. */
  sessionVersion?: number;
}

export interface NotificationPrefs {
  /** Push to this user's devices; in-app list is unaffected. */
  push: boolean;
  /** Types hidden from the list and never pushed. */
  muted: NotificationType[];
}

export interface AppData {
  companies: Company[];
  users: UserAccount[];
  employees: Employee[];
  clients: Client[];
  orders: Order[];
  orderStages: OrderStage[];
  checklistItems: ChecklistItem[];
  materials: Material[];
  inventoryMovements: InventoryMovement[];
  tasks: Task[];
  reports: EmployeeReport[];
  attendance: Attendance[];
  attendanceQr: AttendanceQR[];
  salaries: SalaryRecord[];
  salaryPayments: SalaryPayment[];
  advances: Advance[];
  penalties: Penalty[];
  settings: CompanySettings[];
  userSettings: UserSettings[];
  notifications: Notification[];
  activityLog: ActivityLog[];
  orderAuditLogs: OrderAuditLog[];
  calculatorProjects: CalculatorProject[];
  commercialProposals: CommercialProposal[];
  atelierCornicePrices: AtelierCornicePrice[];
  atelierFabrics: AtelierFabric[];
  atelierAssemblyCoeffs: AtelierAssemblyCoeff[];
  atelierCoverPrices: AtelierCoverPrice[];
  atelierPillowPrices: AtelierPillowPrice[];
  atelierAccessoryPrices: AtelierAccessoryPrice[];
  atelierRollerPrices: AtelierRollerPrice[];
  atelierInstallPrices: AtelierInstallPrice[];
  atelierServicePrices: AtelierServicePrices[];
  atelierLabels: AtelierLabelsRecord[];
  measurements: Measurement[];
  clientMeasurements: ClientMeasurement[];
  galleryFolders: GalleryFolder[];
  galleryPhotos: GalleryPhoto[];
  furniturePriceItems: FurniturePriceItem[];
  cashEntries: CashEntry[];
  purchases: Purchase[];
  orderExpenses: OrderExpense[];
  expenseCategories: ExpenseCategory[];
  pushSubscriptions: PushSubscriptionRecord[];
  grokConnectors: GrokConnectorSettings[];
  grokLogs: GrokLogEntry[];
  /** Names of one-time data migrations already applied */
  migrations: string[];
}

export type GrokConnectorMode = "test" | "live";

/** Per-company Grok Bot connector config. The access token lives only in the server env. */
export interface GrokConnectorSettings {
  companyId: string;
  enabled: boolean;
  mode: GrokConnectorMode;
  allowedCommands: string[];
  /** Users the bot may act on behalf of */
  allowedUserIds: string[];
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  updatedAt: string;
}

export type GrokLogOutcome =
  | "ok"
  | "preview"
  | "confirmation_required"
  | "denied"
  | "error";

export interface GrokLogEntry {
  id: string;
  /** null when the request failed before the company was known (bad token, unknown user) */
  companyId: string | null;
  at: string;
  requestId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  command: string;
  mode: GrokConnectorMode | null;
  outcome: GrokLogOutcome;
  status: number;
  message: string;
  ip: string | null;
}

export type CashEntrySource = "manual" | "prepayment" | "payment" | "purchase";

export interface CashEntry {
  id: string;
  companyId: string;
  date: string;
  type: "in" | "out";
  amount: number;
  category: string;
  comment: string | null;
  orderId: string | null;
  purchaseId: string | null;
  paymentId: string | null;
  source: CashEntrySource;
  createdAt: string;
}

export type PurchaseStatus = "draft" | "posted";

export interface PurchaseItem {
  id: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  price: number;
  materialId: string | null;
  /** Длина хлыста, м — для карнизов */
  lengthM: number | null;
}

export interface Purchase {
  id: string;
  companyId: string;
  number: string;
  supplier: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
  cashEntryId: string | null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  lead: "Лид",
  application: "Обработка заявки",
  contract: "Договор",
  approval: "Утверждение",
  production: "Производство",
  installation: "Монтаж",
  closed: "Закрыт",
};

export const ATELIER_ORDER_STATUS_LABELS: Record<AtelierOrderStatus, string> = {
  draft: "Расчёт",
  measurement: "Замер",
  awaiting: "Ожидает принятия в работу",
  in_work: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const LEGACY_ATELIER_STATUS_MAP: Record<LegacyAtelierOrderStatus, AtelierOrderStatus> = {
  new: "draft",
  in_progress: "in_work",
  production: "in_work",
  ready: "in_work",
  installed: "completed",
};

export const EXPENSE_CATEGORY_LABELS: Record<"materials" | "delivery" | "labor" | "other", string> = {
  materials: "Материалы",
  delivery: "Доставка",
  labor: "Работа",
  other: "Прочее",
};

/** Статусы в порядке процесса — для выбора в формах. */
export const ATELIER_SELECTABLE_STATUSES: AtelierOrderStatus[] = [
  "draft",
  "measurement",
  "awaiting",
  "in_work",
  "completed",
  "cancelled",
];

export const STAGE_LABELS: Record<BuiltinStageKey, string> = {
  cutting: "Распил",
  edging: "Закатка",
  drilling: "Присадка",
  assembly: "Сборка",
  painting: "Покраска",
  multicam: "Мультикам",
  vacuum: "Вакуумная оклейка",
  installation: "Монтаж",
  done: "Готово",
};

/** Подпись этапа: из воронки компании, затем встроенная, затем сам ключ. */
export function stageLabel(
  key: string,
  funnel?: readonly { key: string; label: string }[] | null,
): string {
  const custom = funnel?.find((s) => s.key === key)?.label;
  if (custom) return custom;
  return (STAGE_LABELS as Record<string, string>)[key] ?? key;
}

export const SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: "Instagram",
  website: "Сайт",
  referral: "Рекомендация",
  "2gis": "2ГИС",
  repeat: "Повторный",
  other: "Другое",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Владелец",
  DIRECTOR: "Директор",
  MANAGER: "Управляющий",
  MASTER: "Мастер",
  DRIVER: "Водитель",
  DESIGNER: "Дизайнер",
  TECHNOLOGIST: "Технолог",
  ADMIN: "Админ",
  WORKSHOP: "Цех",
  SEAMSTRESS: "Швея",
  MOBILOGRAPHER: "Мобилограф",
};

export const PURCHASE_CATEGORY_IDS: InventoryCategory[] = [
  "fabric_portiere",
  "fabric_tulle",
  "sewing_hardware",
  "cornice",
  "roman_mechanism",
  "hardware",
  "consumables",
];

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  hardware: "Фурнитура",
  sheet: "Листовой материал",
  consumables: "Расходники",
  machine: "Нужды станков",
  fabric_portiere: "Портьера",
  fabric_tulle: "Тюль",
  sewing_hardware: "Швейная фурнитура",
  cornice: "Карнизы",
  roman_mechanism: "Римские механизмы",
};

export const ATELIER_BLIND_LABELS: Record<AtelierBlindKind, string> = {
  wood: "Деревянные",
  aluminum: "Алюминиевые",
  bamboo: "Бамбуковые",
};

export const ATELIER_CORNICE_LABELS: Record<AtelierCorniceKind, string> = {
  ceiling_plastic_1: "Потолочный пластиковый 1-рядный",
  ceiling_plastic_2: "Потолочный пластиковый 2-рядный",
  ceiling_plastic_3: "Потолочный пластиковый 3-рядный",
  aluminum_1: "Алюминиевый 1-рядный",
  aluminum_2: "Алюминиевый 2-рядный",
  aluminum_3: "Алюминиевый 3-рядный",
  simple_1: "Simple 1-рядный",
  simple_2: "Simple 2-рядный",
  simple_3: "Simple 3-рядный",
  forged: "Кованый",
};

export const ATELIER_FORGED_COLOR_LABELS: Record<AtelierForgedColor, string> = {
  gold: "Золото",
  bronze: "Бронза",
  white: "Белый",
  black: "Черный",
  chrome: "Хром",
  satin: "Сатин",
};
