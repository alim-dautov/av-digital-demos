/**
 * Начальные данные: сотрудники, справочники, коллекции, ~30 товаров, клиенты, демо-документы.
 * Документы создаются через сервисный слой, чтобы сработали остатки, долги и начисления по правилам.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { DB } from "./index";
import * as s from "./schema";
import { fullPermissions, type Permissions, type Principal } from "@/lib/rbac";
import { addDays, today } from "@/lib/format";
import { createReceipt } from "@/modules/receipts/service";
import { createOrder, setStatus, finishAssembly } from "@/modules/orders/service";
import { createShipment } from "@/modules/shipments/service";
import { createPayment } from "@/modules/finance/service";
import { createTask } from "@/modules/tasks/service";
import { createLead } from "@/modules/leads/service";
import { setSetting, DEFAULT_SETTINGS } from "@/modules/settings/store";

const perms = (modules: Permissions["modules"], flags: Permissions["flags"] = {}): Permissions => ({ modules, flags });

export const SEED_USERS = [
  {
    key: "director", login: "director", name: "Директор", position: "Владелец, главный администратор", isOwner: true, color: "#0B2B54",
    permissions: fullPermissions(),
  },
  {
    key: "accountant", login: "accountant", name: "Асель", position: "Учёт, бухгалтерия", color: "#7C3AED",
    permissions: perms(
      { products: "full", counterparties: "full", receipts: "full", payments: "full", finance: "full", stock: "full", shipments: "full", orders: "view",
        analytics: "view", prices: "view", tasks: "full", notes: "full", assistant: "view" },
      { seePurchase: true, seeProfit: true, seeSalaries: true, payrollPay: true, payrollTimesheet: true, seeOwnEarnings: true },
    ),
  },
  {
    key: "sales1", login: "sales1", name: "Данияр", position: "Менеджер по продажам (рынки, базар)", isSalesManager: true, color: "#0EA5E9", weeklyPlan: 300000000,
    permissions: perms({ orders: "full", counterparties: "full", pipeline: "full", tasks: "full", prices: "full", products: "view", stock: "view", shipments: "view", notes: "full", whatsapp: "full", assistant: "view" }, { seeOwnEarnings: true }),
  },
  {
    key: "sales2", login: "sales2", name: "Арман", position: "Менеджер по продажам (розница)", isSalesManager: true, color: "#16A34A", weeklyPlan: 200000000,
    permissions: perms({ orders: "full", counterparties: "full", pipeline: "full", tasks: "full", prices: "full", products: "view", stock: "view", shipments: "view", notes: "full", whatsapp: "full", assistant: "view" }, { seeOwnEarnings: true }),
  },
  {
    key: "picker", login: "picker", name: "Тимур", position: "Сборщик, стажёр", isAssembler: true, color: "#F59E0B",
    permissions: perms({ orders: "view", stock: "view", shipments: "full", tasks: "full", products: "view", notes: "view" }, { seeOwnEarnings: true }),
  },
] as const;

const PRODUCTS: { name: string; sku: string; unit: string; folder: string; purchase: number; cash: number; bazaar: number; shop: number; min?: number }[] = [
  // Вектор — кабель и провод (за метр)
  { name: "Кабель ВВГнг 3х1,5", sku: "VEK-VVG-315", unit: "м", folder: "Кабель ВВГ", purchase: 285, cash: 360, bazaar: 340, shop: 380, min: 500 },
  { name: "Кабель ВВГнг 3х2,5", sku: "VEK-VVG-325", unit: "м", folder: "Кабель ВВГ", purchase: 430, cash: 540, bazaar: 510, shop: 570, min: 500 },
  { name: "Кабель ВВГнг 3х4", sku: "VEK-VVG-34", unit: "м", folder: "Кабель ВВГ", purchase: 690, cash: 860, bazaar: 820, shop: 900, min: 200 },
  { name: "Кабель ВВГнг 3х6", sku: "VEK-VVG-36", unit: "м", folder: "Кабель ВВГ", purchase: 1020, cash: 1270, bazaar: 1210, shop: 1330 },
  { name: "Провод ПВС 2х1,5", sku: "VEK-PVS-215", unit: "м", folder: "Провод ПВС", purchase: 190, cash: 240, bazaar: 225, shop: 255, min: 300 },
  { name: "Провод ПВС 3х2,5", sku: "VEK-PVS-325", unit: "м", folder: "Провод ПВС", purchase: 410, cash: 520, bazaar: 495, shop: 545 },
  { name: "Провод ПуГВ 1х2,5 белый", sku: "VEK-PUGV-25-W", unit: "м", folder: "Провод ПуГВ", purchase: 120, cash: 155, bazaar: 145, shop: 165 },
  { name: "Провод ПуГВ 1х2,5 красный", sku: "VEK-PUGV-25-R", unit: "м", folder: "Провод ПуГВ", purchase: 120, cash: 150, bazaar: 140, shop: 160 },
  { name: "Провод ПуГВ 1х2,5 синий", sku: "VEK-PUGV-25-B", unit: "м", folder: "Провод ПуГВ", purchase: 118, cash: 150, bazaar: 142, shop: 162 },
  { name: "Провод ПуГВ 1х2,5 желто-зеленый", sku: "VEK-PUGV-25-YG", unit: "м", folder: "Провод ПуГВ", purchase: 125, cash: 158, bazaar: 148, shop: 168 },
  // Атлас — электроинструмент
  { name: "Перфоратор Атлас ПЭ-800", sku: "ATL-PE800", unit: "шт", folder: "Атлас", purchase: 21500, cash: 27900, bazaar: 26500, shop: 28900, min: 3 },
  { name: "Дрель-шуруповёрт Атлас ДА-18", sku: "ATL-DA18", unit: "шт", folder: "Атлас", purchase: 16800, cash: 21900, bazaar: 20500, shop: 22900, min: 3 },
  { name: "УШМ Атлас 125/900", sku: "ATL-USM125", unit: "шт", folder: "Атлас", purchase: 11900, cash: 15500, bazaar: 14600, shop: 16200, min: 4 },
  { name: "Лобзик Атлас Л-650", sku: "ATL-L650", unit: "шт", folder: "Атлас", purchase: 9800, cash: 12900, bazaar: 12100, shop: 13500 },
  { name: "Диск отрезной 125х1,2", sku: "ATL-DSK125", unit: "шт", folder: "Атлас", purchase: 140, cash: 200, bazaar: 180, shop: 220, min: 100 },
  { name: "Бур SDS+ 8х160", sku: "ATL-BUR8", unit: "шт", folder: "Атлас", purchase: 380, cash: 520, bazaar: 480, shop: 560 },
  // Норд — электроустановочные изделия
  { name: "Розетка Норд двойная с заземлением, белая", sku: "NRD-RZ2-W", unit: "шт", folder: "Норд", purchase: 1450, cash: 1890, bazaar: 1790, shop: 1990, min: 20 },
  { name: "Выключатель Норд одноклавишный, белый", sku: "NRD-VK1-W", unit: "шт", folder: "Норд", purchase: 980, cash: 1290, bazaar: 1210, shop: 1350, min: 20 },
  { name: "Выключатель Норд двухклавишный, белый", sku: "NRD-VK2-W", unit: "шт", folder: "Норд", purchase: 1190, cash: 1550, bazaar: 1460, shop: 1620 },
  { name: "Рамка Норд 2-местная, белая", sku: "NRD-RM2-W", unit: "шт", folder: "Норд", purchase: 620, cash: 820, bazaar: 770, shop: 860 },
  { name: "Автомат Норд 1P 16А", sku: "NRD-AV16", unit: "шт", folder: "Норд", purchase: 1150, cash: 1490, bazaar: 1400, shop: 1560, min: 30 },
  { name: "Автомат Норд 1P 25А", sku: "NRD-AV25", unit: "шт", folder: "Норд", purchase: 1180, cash: 1530, bazaar: 1440, shop: 1600 },
  { name: "УЗО Норд 2P 40А 30мА", sku: "NRD-UZO40", unit: "шт", folder: "Норд", purchase: 5900, cash: 7600, bazaar: 7200, shop: 7900 },
  // ПластПро — гофра, коробки, кабель-каналы
  { name: "Гофра ПВХ 16 мм (бухта 100 м)", sku: "PLP-GOF16", unit: "бухта", folder: "ПластПро", purchase: 2900, cash: 3900, bazaar: 3650, shop: 4100, min: 10 },
  { name: "Гофра ПВХ 20 мм (бухта 100 м)", sku: "PLP-GOF20", unit: "бухта", folder: "ПластПро", purchase: 3600, cash: 4800, bazaar: 4500, shop: 5000 },
  { name: "Коробка распаечная 100х100", sku: "PLP-KR100", unit: "шт", folder: "ПластПро", purchase: 210, cash: 300, bazaar: 280, shop: 320, min: 50 },
  { name: "Подрозетник 68 мм", sku: "PLP-PR68", unit: "шт", folder: "ПластПро", purchase: 38, cash: 60, bazaar: 55, shop: 65, min: 200 },
  { name: "Кабель-канал 25х16 (2 м)", sku: "PLP-KK2516", unit: "шт", folder: "ПластПро", purchase: 290, cash: 400, bazaar: 370, shop: 420 },
  { name: "Изолента ПВХ 19 мм синяя", sku: "PLP-IZ19B", unit: "шт", folder: "ПластПро", purchase: 160, cash: 250, bazaar: 230, shop: 270 },
  { name: "Хомут нейлоновый 200 мм (100 шт)", sku: "PLP-HM200", unit: "уп", folder: "ПластПро", purchase: 450, cash: 650, bazaar: 600, shop: 690 },
];

export async function seed(db: DB, opts: { demo?: boolean; password?: string } = {}) {
  const demo = opts.demo ?? true;
  const [existing] = await db.select().from(s.users).limit(1);
  if (existing) return { skipped: true as const, passwords: {} as Record<string, string> };

  /* Сотрудники */
  const passwords: Record<string, string> = {};
  const ids: Record<string, number> = {};
  for (const u of SEED_USERS) {
    const pw = opts.password ?? randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);
    passwords[u.login] = pw;
    const [row] = await db.insert(s.users).values({
      login: u.login, name: u.name, position: u.position, color: u.color, isOwner: "isOwner" in u ? u.isOwner : false,
      isSalesManager: "isSalesManager" in u ? u.isSalesManager : false, isAssembler: "isAssembler" in u ? u.isAssembler : false,
      weeklyPlan: "weeklyPlan" in u ? u.weeklyPlan : 0, permissions: u.permissions as Permissions, passwordHash: await bcrypt.hash(pw, 10), mustChangePassword: process.env.DEMO_MODE !== "1",
    }).returning();
    ids[u.key] = row.id;
  }

  /* Справочники */
  const pt = await db.insert(s.priceTypes).values([
    { code: "purchase", name: "Закупка", isPurchase: true, sort: 0 },
    { code: "cash", name: "Наличный расчёт", sort: 1 },
    { code: "bazaar", name: "Базар", sort: 2 },
    { code: "shop", name: "Магазин", sort: 3 },
  ]).returning();
  const ptId = Object.fromEntries(pt.map((x) => [x.code, x.id]));

  await db.insert(s.orderStatuses).values([
    { code: "new", name: "Новый", color: "#2563EB", sort: 0 },
    { code: "price", name: "Прайс для клиента", color: "#7C3AED", sort: 1 },
    { code: "awaiting", name: "Ожидает доставки", color: "#F59E0B", sort: 2 },
    { code: "delivered", name: "Доставлен", color: "#0EA5E9", sort: 3 },
    { code: "paid", name: "Оплачен", color: "#16A34A", sort: 4, isFinal: true },
    { code: "cancelled", name: "Отменён", color: "#94A3B8", sort: 5, isCancelled: true },
  ]);
  await db.insert(s.taskStages).values([
    { name: "Новая", color: "#2563EB", sort: 0 },
    { name: "В работе", color: "#F59E0B", sort: 1 },
    { name: "На проверке", color: "#7C3AED", sort: 2 },
    { name: "Готово", color: "#16A34A", sort: 3, isDone: true },
  ]);
  const ls = await db.insert(s.leadStages).values([
    { name: "Новый лид", color: "#2563EB", sort: 0 },
    { name: "Квалификация", color: "#0EA5E9", sort: 1 },
    { name: "Прайс/КП отправлен", color: "#7C3AED", sort: 2 },
    { name: "Переговоры", color: "#F59E0B", sort: 3 },
    { name: "Заявка создана", color: "#16A34A", sort: 4, kind: "won" },
    { name: "Отказ", color: "#94A3B8", sort: 5, kind: "lost" },
  ]).returning();
  const [wh] = await db.insert(s.warehouses).values({ name: "Основной склад" }).returning();
  const acc = await db.insert(s.cashAccounts).values([{ name: "Касса (наличные)", kind: "cash" }, { name: "Kaspi", kind: "kaspi" }, { name: "Расчётный счёт", kind: "bank" }]).returning();
  await db.insert(s.finCategories).values([
    { name: "Оплата от клиентов", kind: "income", code: "client_payment" },
    { name: "Прочие поступления", kind: "income" },
    { name: "Оплата поставщикам", kind: "expense", code: "supplier_payment" },
    { name: "Зарплата", kind: "expense", code: "salary" },
    { name: "Аренда", kind: "expense" },
    { name: "Транспорт и доставка", kind: "expense" },
    { name: "Хозрасходы", kind: "expense" },
    { name: "Налоги", kind: "expense" },
    { name: "Связь и интернет", kind: "expense" },
  ]);
  await db.insert(s.counterpartyTags).values([{ name: "базар", color: "#F59E0B" }, { name: "магазин", color: "#2563EB" }, { name: "электромонтаж", color: "#16A34A" }, { name: "VIP", color: "#DC2626" }]);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await setSetting(db, k as never, v as never);

  /* Коллекции */
  const top: Record<string, number> = {};
  for (const [i, n] of ["Вектор", "Атлас", "Норд", "ПластПро"].entries()) {
    const [f] = await db.insert(s.folders).values({ name: n, sort: i }).returning();
    top[n] = f.id;
  }
  for (const [i, n] of ["Кабель ВВГ", "Провод ПВС", "Провод ПуГВ"].entries()) {
    const [f] = await db.insert(s.folders).values({ name: n, parentId: top["Вектор"], sort: i }).returning();
    top[n] = f.id;
  }

  /* Товары */
  const pid: number[] = [];
  for (const p of PRODUCTS) {
    const { norm } = await import("@/lib/format");
    const [row] = await db.insert(s.products).values({ name: p.name, sku: p.sku, unit: p.unit, folderId: top[p.folder], minStock: p.min ?? 0, searchText: norm(`${p.name} ${p.sku}`) }).returning();
    pid.push(row.id);
    await db.insert(s.productPrices).values([
      { productId: row.id, priceTypeId: ptId.purchase, value: p.purchase * 100 },
      { productId: row.id, priceTypeId: ptId.cash, value: p.cash * 100 },
      { productId: row.id, priceTypeId: ptId.bazaar, value: p.bazaar * 100 },
      { productId: row.id, priceTypeId: ptId.shop, value: p.shop * 100 },
    ]);
  }

  /* Контрагенты */
  const cp = async (v: Partial<typeof s.counterparties.$inferInsert> & { name: string }) => (await db.insert(s.counterparties).values(v).returning())[0].id;
  const svc1 = await cp({ name: "Заявка", isService: true, kind: "client", comment: "Служебный контрагент для внутренних заявок" });
  const svc2 = await cp({ name: "Оптовая Заявка", isService: true, kind: "client", segment: "bazaar", comment: "Служебный контрагент для оптовых заявок" });
  const cBaz1 = await cp({ name: "Ерлан, Рынок ряд 14", segment: "bazaar", tags: ["базар"], phone: "+77011234501", whatsapp: "+77011234501", managerId: ids.sales1, debtLimit: 50000000 });
  const cBaz2 = await cp({ name: "ИП Оспанов (Рынок, 3 сектор)", segment: "bazaar", tags: ["базар"], phone: "+77012234502", whatsapp: "+77012234502", managerId: ids.sales1, debtLimit: 30000000 });
  const cBaz3 = await cp({ name: "Электро-Базар «Достык»", segment: "bazaar", tags: ["базар", "VIP"], phone: "+77013234503", managerId: ids.sales1 });
  const cShop1 = await cp({ name: "Магазин «Яркий свет»", segment: "shop", tags: ["магазин"], phone: "+77071234511", whatsapp: "+77071234511", managerId: ids.sales2, address: "г. Алматы, пр. Образцовый 24", debtLimit: 40000000 });
  const cShop2 = await cp({ name: "ТОО «Энерго-Сити»", segment: "shop", tags: ["магазин"], phone: "+77072234512", managerId: ids.sales2, bin: "180540012345" });
  const cShop3 = await cp({ name: "Магазин «Мастер Дом» (пригород)", segment: "shop", tags: ["магазин"], phone: "+77073234513", managerId: ids.sales2 });
  const cIns1 = await cp({ name: "ИП Тестов — электромонтаж", segment: "install", tags: ["электромонтаж"], phone: "+77751234521", managerId: ids.sales2 });
  const cIns2 = await cp({ name: "ТОО «Демо-Монтаж»", segment: "install", tags: ["электромонтаж"], phone: "+77752234522", managerId: ids.sales1, bin: "200340056789" });
  const sup1 = await cp({ name: "ТОО «Вектор Кабель»", kind: "supplier", phone: "+77273000001" });
  const sup2 = await cp({ name: "Атлас Инструмент (дистрибьютор)", kind: "supplier", phone: "+77273000002" });
  const sup3 = await cp({ name: "ТОО «ПластПро»", kind: "supplier", phone: "+77273000003" });
  void svc1; void cShop3; void cBaz3;

  /* Правила начислений и схемы оплаты */
  await db.insert(s.accrualRules).values([
    { name: "1% Арману со своих заявок", authorMatch: "user", authorUserId: ids.sales2, recipientMode: "author", rateBp: 100, base: "order_total", moment: "order_created" },
    { name: "0,5% Арману с заявок Данияра", authorMatch: "user", authorUserId: ids.sales1, recipientMode: "user", recipientUserId: ids.sales2, rateBp: 50, base: "order_total", moment: "order_created" },
  ]);
  const monthStart = today().slice(0, 8) + "01";
  const sinceStart = addDays(monthStart, -31).slice(0, 8) + "01";
  await db.insert(s.paySchemes).values([
    { userId: ids.sales2, validFrom: sinceStart, components: { salary: { amount: 15000000, prorate: true, workWeek: 6 } }, comment: "Демо: оклад уточняется, процент — по правилам заявок" },
    { userId: ids.sales1, validFrom: sinceStart, components: {}, comment: "Схема уточняется" },
    { userId: ids.picker, validFrom: sinceStart, components: { salary: { amount: 8000000, prorate: true, workWeek: 6 }, piecework: { per: "order", rate: 50000, minPerShift: 0 } }, comment: "Стажировка + сдельная за сборку" },
    { userId: ids.accountant, validFrom: sinceStart, components: { salary: { amount: 25000000, prorate: false, workWeek: 5 } } },
  ]);
  await db.insert(s.kpiTargets).values([
    { userId: ids.sales2, metric: "revenue", period: "month", target: 800000000 },
    { userId: ids.sales1, metric: "revenue", period: "month", target: 1200000000 },
    { userId: ids.picker, metric: "tasks_on_time_pct", period: "month", target: 90 },
  ]);

  if (!demo) return { skipped: false as const, passwords };

  /* ───── Демо-документы ───── */
  const P = async (key: string): Promise<Principal> => {
    const [u] = await db.select().from(s.users).where(eq(s.users.id, ids[key]));
    return { id: u.id, name: u.name, isOwner: u.isOwner, isSalesManager: u.isSalesManager, isAssembler: u.isAssembler, permissions: u.isOwner ? fullPermissions() : u.permissions };
  };
  const dir = await P("director"), aiz = await P("accountant"), ern = await P("sales1"), ers = await P("sales2"), nar = await P("picker");
  const d = (n: number) => addDays(today(), n);
  const price = (i: number, code: "purchase" | "cash" | "bazaar" | "shop") => PRODUCTS[i][code] * 100;

  // Приёмки (две по Вектору — чтобы было сравнение цен)
  await createReceipt(db, aiz, { supplierId: sup1, date: d(-20), posted: true, comment: "Первая поставка", items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ productId: pid[i], qty: i < 4 ? 1000 : 600, price: price(i, "purchase"), excluded: false })) });
  await createReceipt(db, aiz, { supplierId: sup1, date: d(-6), posted: true, comment: "", supplierDocNumber: "ВК-4471", items: [0, 1, 4].map((i) => ({ productId: pid[i], qty: 500, price: Math.round(price(i, "purchase") * 1.06), excluded: false })) });
  await createReceipt(db, aiz, { supplierId: sup2, date: d(-15), posted: true, comment: "", items: [10, 11, 12, 13, 14, 15].map((i) => ({ productId: pid[i], qty: i >= 14 ? 300 : 12, price: price(i, "purchase"), excluded: false })) });
  await createReceipt(db, aiz, { supplierId: sup3, date: d(-12), posted: true, comment: "", items: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29].map((i) => ({ productId: pid[i], qty: i === 26 ? 1000 : 80, price: price(i, "purchase"), excluded: false })) });
  // Товар в пути (дата наперёд) и черновик
  await createReceipt(db, aiz, { supplierId: sup2, date: d(4), posted: true, comment: "Едет из другого города", items: [{ productId: pid[10], qty: 10, price: price(10, "purchase"), excluded: false }, { productId: pid[12], qty: 10, price: Math.round(price(12, "purchase") * 0.95), excluded: false }] });
  await createReceipt(db, aiz, { supplierId: sup3, date: d(0), posted: false, comment: "Черновик — ждём счёт", items: [{ productId: pid[23], qty: 30, price: price(23, "purchase"), excluded: false }] });

  const st = Object.fromEntries((await db.select().from(s.orderStatuses)).map((x) => [x.code, x.id]));

  // Заявки Армана (1% ему) и Данияра (0,5% Арману)
  const o1 = await createOrder(db, ers, { counterpartyId: cShop1, items: [{ productId: pid[16], qty: 40 }, { productId: pid[17], qty: 40 }, { productId: pid[20], qty: 20 }], deliveryDate: d(-8), comment: "К открытию второй точки", source: "manual", discountPct: 0 });
  const o2 = await createOrder(db, ern, { counterpartyId: cBaz1, items: [{ productId: pid[1], qty: 300 }, { productId: pid[4], qty: 200 }, { productId: pid[26], qty: 200 }], deliveryDate: d(-5), source: "text", discountPct: 0, comment: "" });
  const o3 = await createOrder(db, ern, { counterpartyId: cBaz2, items: [{ productId: pid[10], qty: 4 }, { productId: pid[12], qty: 6 }, { productId: pid[14], qty: 100 }], deliveryDate: d(-2), source: "manual", discountPct: 2, comment: "" });
  const o4 = await createOrder(db, ers, { counterpartyId: cIns1, items: [{ productId: pid[1], qty: 150 }, { productId: pid[23], qty: 5 }, { productId: pid[25], qty: 40 }, { productId: pid[20], qty: 12 }], deliveryDate: d(1), source: "manual", discountPct: 0, comment: "" });
  const o5 = await createOrder(db, ern, { counterpartyId: svc2, items: [{ productId: pid[0], qty: 500 }, { productId: pid[5], qty: 200 }], deliveryDate: d(2), comment: "Оптовая заявка на рынок", source: "manual", discountPct: 0 });
  const o6 = await createOrder(db, ers, { counterpartyId: cShop2, items: [{ productId: pid[11], qty: 3 }, { productId: pid[13], qty: 2 }], source: "manual", discountPct: 0, comment: "" });
  await createOrder(db, ern, { counterpartyId: cIns2, items: [{ productId: pid[2], qty: 400 }, { productId: pid[22], qty: 6 }], deliveryDate: d(3), source: "voice", discountPct: 0, comment: "" });

  for (const o of [o1, o2, o3]) await setStatus(db, dir, o.id, st.awaiting);
  await setStatus(db, dir, o4.id, st.price);
  await setStatus(db, dir, o5.id, st.awaiting);
  for (const o of [o1, o2, o3]) await finishAssembly(db, nar, o.id);

  // Отгрузки и оплаты
  const ship = async (o: typeof o1, date: string) => createShipment(db, aiz, { kind: "shipment", orderId: o.id, counterpartyId: o.counterpartyId, date, items: o.items.map((i) => ({ productId: i.productId, qty: i.qty, price: Math.round(i.price * (1 - o.discountPct / 100)) })), comment: "", overrideDebtLimit: false });
  await ship(o1, d(-8));
  await ship(o2, d(-5));
  await createPayment(db, aiz, { direction: "in", counterpartyId: cShop1, amount: o1.total, method: "kaspi", orderId: o1.id, date: d(-7), comment: "" });
  await createPayment(db, aiz, { direction: "in", counterpartyId: cBaz1, amount: Math.round(o2.total * 0.6), method: "cash", orderId: o2.id, date: d(-4), comment: "Частично, остаток через неделю" });
  // «Доставлен» — отгрузка неотгруженного проводится автоматически
  await setStatus(db, dir, o3.id, st.delivered, "Отвезли клиенту");
  // Возврат по o2
  await createShipment(db, aiz, { kind: "return", orderId: o2.id, counterpartyId: cBaz1, date: d(-3), items: [{ productId: pid[26], qty: 50, price: price(26, "bazaar") }], comment: "Не подошёл размер", overrideDebtLimit: false });
  // Оплата поставщику
  await createPayment(db, aiz, { direction: "out", counterpartyId: sup1, amount: 40000000, method: "transfer", date: d(-10), comment: "Частичная оплата" });
  await createPayment(db, aiz, { direction: "out", counterpartyId: sup3, amount: 10000000, method: "transfer", date: d(-9), comment: "" });
  // Отгрузка без заявки, раньше приёмки → отрицательный остаток
  await createShipment(db, aiz, { kind: "shipment", counterpartyId: cShop3, date: d(-1), items: [{ productId: pid[24], qty: 100, price: price(24, "shop") }], comment: "Отгрузили со склада партнёра, приёмка позже", overrideDebtLimit: false });
  void o6;

  // Финансы — расходы
  const cats = Object.fromEntries((await db.select().from(s.finCategories)).map((c) => [c.name, c.id]));
  await db.insert(s.finTransactions).values([
    { date: d(-14), kind: "expense", accountId: acc[2].id, categoryId: cats["Аренда"], amount: 35000000, comment: "Аренда склада", authorId: ids.accountant },
    { date: d(-6), kind: "expense", accountId: acc[0].id, categoryId: cats["Транспорт и доставка"], amount: 1800000, comment: "Газель на рынок", authorId: ids.accountant },
    { date: d(-2), kind: "transfer", accountId: acc[1].id, toAccountId: acc[0].id, amount: 5000000, comment: "Снятие с Kaspi в кассу", authorId: ids.accountant },
  ]);

  // Табель за текущий месяц для Тимура и Армана
  for (let dd = monthStart; dd <= today(); dd = addDays(dd, 1)) {
    const wd = new Date(dd + "T00:00:00Z").getUTCDay();
    if (wd === 0) continue;
    for (const k of ["picker", "sales2"]) await db.insert(s.timesheet).values({ userId: ids[k], date: dd, status: "present", hours: k === "picker" && wd === 6 ? 10 : 8, authorId: ids.accountant }).onConflictDoNothing();
  }

  // Задачи
  const dueIso = (days: number, h = 18) => new Date(Date.parse(d(days) + `T${String(h).padStart(2, "0")}:00:00+05:00`)).toISOString();
  await createTask(db, dir, { title: "Сверка с «Вектор Кабель» за месяц", description: "Запросить акт сверки, сравнить с нашим.", assigneeId: ids.accountant, dueAt: dueIso(2), priority: "high", tags: ["сверка"], counterpartyId: sup1, attachments: [] });
  await createTask(db, dir, { title: "Обзвонить должников базара", description: "Ерлан — остаток по заявке.", assigneeId: ids.sales1, dueAt: dueIso(-1), priority: "urgent", tags: ["долги"], counterpartyId: cBaz1, attachments: [] });
  await createTask(db, ers, { title: "Подготовить КП для «Энерго-Сити»", assigneeId: ids.sales2, dueAt: dueIso(1), priority: "normal", tags: ["КП"], counterpartyId: cShop2, description: "", attachments: [] });
  await createTask(db, dir, { title: "Собрать заявку для монтажников", assigneeId: ids.picker, dueAt: dueIso(1, 12), priority: "high", tags: ["сборка"], orderId: o4.id, description: "", attachments: [] });
  await createTask(db, dir, { title: "Инвентаризация ПластПро", assigneeId: ids.picker, dueAt: dueIso(5), priority: "low", tags: ["склад"], description: "", attachments: [] });

  // Лиды
  await createLead(db, ern, { title: "Опт кабеля для павильона", contactName: "Марат", phone: "+77015550011", source: "WhatsApp", amount: 120000000, segment: "bazaar", comment: "", stageId: ls[1].id });
  await createLead(db, ers, { title: "Новый магазин в пригороде", contactName: "Айгерим", phone: "+77015550012", source: "Звонок", amount: 65000000, segment: "shop", comment: "Хочет прайс по Норд", stageId: ls[2].id });
  await createLead(db, ers, { title: "Монтаж ЖК «Новый»", contactName: "Ержан (прораб)", phone: "+77015550013", source: "Рекомендация", amount: 250000000, segment: "install", comment: "", stageId: ls[3].id, nextFollowUpAt: new Date(Date.now() + 86400000).toISOString() });
  await createLead(db, dir, { title: "Сеть строймагазинов (регион)", contactName: "Отдел закупа", source: "Сайт", amount: 400000000, segment: "shop", comment: "", stageId: ls[0].id, managerId: ids.sales2 });

  // Заметки
  await db.insert(s.notes).values([
    { title: "Регламент приёмки товара", body: "1. Сверить количество с накладной.\n2. Проверить сечение кабеля и маркировку.\n3. Провести приёмку в CRM в день поступления.\n4. При расхождении — фото и комментарий в задаче поставщику.", folder: "Регламенты", tags: ["склад"], pinned: true, authorId: ids.director },
    { title: "Скидки для базара", body: "До 3% — менеджер сам. Больше 3% — согласование с директором.", folder: "Продажи", tags: ["скидки"], authorId: ids.director },
    { title: "Мои заметки", body: "Личное — видно только мне.", visibility: "private", authorId: ids.sales2 },
  ]);

  return { skipped: false as const, passwords };
}
