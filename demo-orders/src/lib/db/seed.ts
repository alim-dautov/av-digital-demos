import fs from "fs";
import bcrypt from "bcryptjs";
import { isProduction, isProductionRuntime } from "@/lib/env";
import { DEMO_PASSWORD } from "@/lib/demo";
import { secureProductionUsers, syncDemoAccounts } from "./production-users";
import type {
  ActivityLog,
  Advance,
  AppData,
  Attendance,
  AttendanceQR,
  ChecklistItem,
  Client,
  CommercialProposal,
  Company,
  CompanySettings,
  Employee,
  EmployeeReport,
  InventoryMovement,
  LeadSource,
  Material,
  Notification,
  Order,
  OrderStage,
  OrderStatus,
  Penalty,
  ProductionStageKey,
  SalaryRecord,
  StageStatus,
  Task,
  UserAccount,
  CalculatorProject,
} from "@/types";
import { stageLabel } from "@/types";
import { generateId, nowIso, todayDate, MEBELDEMO_ID } from "@/lib/utils";
import { getDataPath, resetData, saveData, getData } from "./store";
import { appendAtelierToSeed, ensureAtelierData } from "./atelier-seed";
import { buildFurniturePriceItems, ensureFurnitureData } from "./furniture-seed";
import { runMigrations } from "./migrations";

const CID = MEBELDEMO_ID;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function isoDaysAgo(n: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function todayAt(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function makeStages(
  orderId: string,
  keys: ProductionStageKey[],
  statuses: StageStatus[],
  masterId: string | null,
): OrderStage[] {
  return keys.map((key, i) => {
    const status = statuses[i] ?? "pending";
    const done = status === "done";
    const inProgress = status === "in_progress";
    return {
      id: `stage_${orderId}_${key}`,
      companyId: CID,
      orderId,
      key,
      label: stageLabel(key),
      sortOrder: i + 1,
      status,
      responsibleId: masterId,
      startDate: done || inProgress ? daysAgo(keys.length - i + 2) : null,
      endDate: done ? daysAgo(keys.length - i) : null,
      durationHours: done ? 4 + i : inProgress ? 3 : null,
      comment: null,
      media: [],
    };
  });
}

export function buildSeedData(): AppData {
  const now = nowIso();
  const today = todayDate();
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const period = today.slice(0, 7);

  const companies: Company[] = [
    {
      id: CID,
      name: "Mebel Demo",
      tagline: "мебель на заказ",
      status: "active",
      currency: "KZT",
      timezone: "Asia/Almaty",
      vertical: "furniture",
      phone: "+7 (727) 000-00-00",
      email: "hello@example.com",
      address: "Алматы",
    },
    {
      id: "company_002",
      name: "Шторы Демо",
      tagline: "шторы и текстиль",
      status: "active",
      currency: "KZT",
      timezone: "Asia/Almaty",
      vertical: "textiles",
      phone: "+7 (727) 111-22-33",
      email: "hello@example.com",
      address: "Алматы",
    },
    {
      id: "company_003",
      name: "Компания 3",
      tagline: "ремонт и строительство",
      status: "active",
      currency: "KZT",
      timezone: "Asia/Almaty",
      vertical: "furniture",
      phone: "+7 (727) 000-00-03",
      email: "hello@example.com",
      address: "Алматы",
    },
    ...[4, 5, 6].map((n) => ({
      id: `company_00${n}`,
      name: `Компания ${n}`,
      tagline: "мебель на заказ",
      status: "active" as const,
      currency: "KZT",
      timezone: "Asia/Almaty",
      vertical: "furniture" as const,
      phone: null,
      email: null,
      address: null,
    })),
  ];

  const employees: Employee[] = [
    {
      id: "emp_daniyar",
      companyId: CID,
      fullName: "Данияр Ахметов",
      firstName: "Данияр",
      phone: "+77017123401",
      position: "Сборщик",
      role: "MASTER",
      status: "active",
      hireDate: "2023-03-15",
      compensationType: "percentage",
      percentage: 15,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_asylkhan",
      companyId: CID,
      fullName: "Арман Сулейменов",
      firstName: "Асылхан",
      phone: "+77017123402",
      position: "Сборщик",
      role: "MASTER",
      status: "active",
      hireDate: "2023-05-20",
      compensationType: "percentage",
      percentage: 15,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_kuanysh",
      companyId: CID,
      fullName: "Ержан Оспанов",
      firstName: "Куаныш",
      phone: "+77017123403",
      position: "Сборщик",
      role: "MASTER",
      status: "active",
      hireDate: "2023-08-01",
      compensationType: "percentage",
      percentage: 15,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_dauren",
      companyId: CID,
      fullName: "Ринат Касенов",
      firstName: "Даурен",
      phone: "+77017123404",
      position: "Сборщик",
      role: "MASTER",
      status: "active",
      hireDate: "2024-01-10",
      compensationType: "percentage",
      percentage: 15,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_doszhan",
      companyId: CID,
      fullName: "Мейрам Токтаров",
      firstName: "Досжан",
      phone: "+77017123405",
      position: "Сборщик",
      role: "MASTER",
      status: "active",
      hireDate: "2024-02-14",
      compensationType: "percentage",
      percentage: 15,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_bekzat",
      companyId: CID,
      fullName: "Бекзат Алимов",
      firstName: "Бекзат",
      phone: "+77017123406",
      position: "Водитель",
      role: "DRIVER",
      status: "active",
      hireDate: "2022-11-01",
      compensationType: "fixed",
      percentage: null,
      fixedSalary: 270000,
      photoUrl: null,
    },
    {
      id: "emp_stanislav",
      companyId: CID,
      fullName: "Олег Громов",
      firstName: "Станислав",
      phone: "+77017123407",
      position: "Водитель",
      role: "DRIVER",
      status: "active",
      hireDate: "2023-06-15",
      compensationType: "fixed",
      percentage: null,
      fixedSalary: 250000,
      photoUrl: null,
    },
    {
      id: "emp_azamat",
      companyId: CID,
      fullName: "Азамат Рахимов",
      firstName: "Азамат",
      phone: "+77017123408",
      position: "Дизайнер / Технолог",
      role: "DESIGNER",
      status: "active",
      hireDate: "2022-09-01",
      compensationType: "fixed",
      percentage: null,
      fixedSalary: 300000,
      photoUrl: null,
    },
    {
      id: "emp_serik",
      companyId: CID,
      fullName: "Серик Умаров",
      firstName: "Серик",
      phone: "+77017123409",
      position: "Управляющий",
      role: "MANAGER",
      status: "active",
      hireDate: "2021-04-01",
      compensationType: "percentage_projects",
      percentage: 10,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_ruslan",
      companyId: CID,
      fullName: "Руслан Назаров",
      firstName: "Руслан",
      phone: "+77017123410",
      position: "Директор",
      role: "DIRECTOR",
      status: "active",
      hireDate: "2020-01-15",
      compensationType: "from_profit",
      percentage: null,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_aidos",
      companyId: CID,
      fullName: "Айдос Демов",
      firstName: "Айдос",
      phone: "+77017123411",
      position: "Владелец",
      role: "OWNER",
      status: "active",
      hireDate: "2019-06-01",
      compensationType: "from_profit",
      percentage: null,
      fixedSalary: null,
      photoUrl: null,
    },
    {
      id: "emp_madina",
      companyId: CID,
      fullName: "Мадина Демова",
      firstName: "Мадина",
      phone: "+77017123412",
      position: "Владелец",
      role: "OWNER",
      status: "active",
      hireDate: "2019-06-01",
      compensationType: "from_profit",
      percentage: null,
      fixedSalary: null,
      photoUrl: null,
    },
  ];

  const userDefs: {
    id: string;
    email: string;
    empId: string;
    role: UserAccount["role"];
  }[] = [
    { id: "user_aidos", email: "aidos@example.com", empId: "emp_aidos", role: "OWNER" },
    { id: "user_madina", email: "madina@example.com", empId: "emp_madina", role: "OWNER" },
    { id: "user_ruslan", email: "ruslan@example.com", empId: "emp_ruslan", role: "DIRECTOR" },
    { id: "user_serik", email: "serik@example.com", empId: "emp_serik", role: "MANAGER" },
    { id: "user_daniyar", email: "daniyar@example.com", empId: "emp_daniyar", role: "MASTER" },
    { id: "user_bekzat", email: "bekzat@example.com", empId: "emp_bekzat", role: "DRIVER" },
    { id: "user_azamat", email: "azamat@example.com", empId: "emp_azamat", role: "DESIGNER" },
  ];

  const users: UserAccount[] = userDefs.map((u) => {
    const emp = employees.find((e) => e.id === u.empId)!;
    return {
      id: u.id,
      companyId: CID,
      email: u.email,
      passwordHash,
      fullName: emp.fullName,
      firstName: emp.firstName,
      role: u.role,
      employeeId: u.empId,
      avatarUrl: null,
      isActive: true,
    };
  });

  const clientSeeds: {
    fullName: string;
    phone: string;
    source: LeadSource;
    comment: string | null;
  }[] = [
    { fullName: "Айгуль Сатпаева", phone: "+77015550101", source: "instagram", comment: "Интересует кухня под заказ" },
    { fullName: "Нурлан Касымов", phone: "+77015550102", source: "website", comment: "Шкаф-купе в спальню" },
    { fullName: "Динара Омарова", phone: "+77015550103", source: "referral", comment: "Рекомендация от Айгуль" },
    { fullName: "Ерлан Тулеубаев", phone: "+77015550104", source: "2gis", comment: "Гардеробная в квартире" },
    { fullName: "Сауле Жаксылыкова", phone: "+77015550105", source: "instagram", comment: "Детская мебель" },
    { fullName: "Бауржан Искаков", phone: "+77015550106", source: "other", comment: "Офисная мебель для кабинета" },
    { fullName: "Мадина Есенова", phone: "+77015550107", source: "website", comment: "Кухонный гарнитур угловой" },
    { fullName: "Тимур Абдрахманов", phone: "+77015550108", source: "referral", comment: "Стеллажи для магазина" },
    { fullName: "Асель Нуркенова", phone: "+77015550109", source: "instagram", comment: "Тумбы под ТВ" },
    { fullName: "Кайрат Жумагулов", phone: "+77015550110", source: "2gis", comment: "Прихожая с зеркалом" },
    { fullName: "Жанна Сейтжанова", phone: "+77015550111", source: "website", comment: "Рабочий стол и стеллаж" },
    { fullName: "Азат Мухамедов", phone: "+77015550112", source: "instagram", comment: "Встроенный шкаф на лоджию" },
    { fullName: "Гульнара Абишева", phone: "+77015550113", source: "referral", comment: "Кухня с островом" },
    { fullName: "Серик Болатов", phone: "+77015550114", source: "other", comment: "Мебель для кафе" },
    { fullName: "Ляззат Кенжебаева", phone: "+77015550115", source: "2gis", comment: "Комод и тумбочки" },
    { fullName: "Арман Смагулов", phone: "+77015550116", source: "instagram", comment: "Гардероб в коридор" },
    { fullName: "Индира Рахимова", phone: "+77015550117", source: "website", comment: "Кухня в новостройке" },
    { fullName: "Данияр Кусаинов", phone: "+77015550118", source: "referral", comment: "Офисные столы 6 шт" },
    { fullName: "Камилла Фролова", phone: "+77015550119", source: "instagram", comment: "Детская кровать с ящиками" },
    { fullName: "Руслан Ибраев", phone: "+77015550120", source: "2gis", comment: "Шкаф в гостиную" },
    { fullName: "Алия Токтарова", phone: "+77015550121", source: "website", comment: "Ванная мебель под заказ" },
    { fullName: "Максат Орынбаев", phone: "+77015550122", source: "other", comment: "Стойка ресепшен" },
    { fullName: "Ботагоз Нурланова", phone: "+77015550123", source: "instagram", comment: "Кухня + барная стойка" },
    { fullName: "Ерлан Шарипов", phone: "+77015550124", source: "referral", comment: "Мебель для кабинета врача" },
    { fullName: "Амина Каримова", phone: "+77015550125", source: "website", comment: "Шкаф-купе 3 двери" },
  ];

  const clients: Client[] = clientSeeds.map((c, i) => ({
    id: `client_${String(i + 1).padStart(3, "0")}`,
    companyId: CID,
    fullName: c.fullName,
    phone: c.phone,
    whatsapp: c.phone,
    email: null,
    source: c.source,
    firstContactAt: isoDaysAgo(60 - i * 2, 11, 30),
    comment: c.comment,
    ordersCount: 0,
    totalAmount: 0,
    lastOrderAt: null,
  }));

  const masters = [
    "emp_daniyar",
    "emp_asylkhan",
    "emp_kuanysh",
    "emp_dauren",
    "emp_doszhan",
  ];

  const orderStatuses: OrderStatus[] = [
    "lead",
    "lead",
    "lead",
    "application",
    "application",
    "application",
    "contract",
    "contract",
    "contract",
    "approval",
    "approval",
    "approval",
    "production",
    "production",
    "production",
    "production",
    "installation",
    "installation",
    "installation",
    "closed",
    "closed",
    "closed",
    "closed",
    "production",
    "application",
    "contract",
  ];

  const orderDescriptions = [
    "Кухонный гарнитур ЛДСП белый глянец, фурнитура Blum",
    "Шкаф-купе 2,4 м с зеркалом, наполнение: штанги и полки",
    "Гардеробная система в нишу 1,8×2,6 м",
    "Детская кровать с ящиками и письменный стол",
    "Офисный стол руководителя + тумба",
    "Прихожая с открытыми полками и мягкой банкеткой",
    "Угловая кухня с фартуком и подсветкой",
    "Стеллажи для магазина одежды — 4 секции",
    "ТВ-зона с тумбой и навесными полками",
    "Встроенный шкаф на лоджию с жалюзийными фасадами",
    "Кухня с островом, столешница кварц",
    "Мебель для кафе: барная стойка и столы",
    "Комод и прикроватные тумбы, МДФ эмаль",
    "Гардероб в коридор с обувницей",
    "Кухня в новостройке, планировка от застройщика",
    "Офисные столы и тумбы — комплект на 6 мест",
    "Детская кровать-домик с ящиками",
    "Шкаф в гостиную с витражными дверцами",
    "Мебель для ванной: пенал и тумба под раковину",
    "Стойка ресепшен для клиники",
    "Кухня + барная стойка, фасады AGT",
    "Мебель для кабинета врача: стол и шкафы",
    "Шкаф-купе 3 двери, наполнение под одежду",
    "Рабочий стол и стеллаж для домашнего офиса",
    "Тумбы под ТВ с кабель-менеджментом",
    "Кухонный остров отдельностоящий",
  ];

  const amounts = [
    420000, 680000, 950000, 310000, 180000, 540000, 1250000, 780000, 390000,
    620000, 2100000, 1450000, 280000, 510000, 1680000, 920000, 350000, 740000,
    260000, 890000, 1950000, 670000, 830000, 450000, 320000, 580000,
  ];

  const orders: Order[] = [];
  const orderStages: OrderStage[] = [];
  const checklistItems: ChecklistItem[] = [];

  for (let i = 0; i < 26; i++) {
    const num = 1001 + i;
    const client = clients[i % clients.length];
    const status = orderStatuses[i];
    const amount = amounts[i];
    const cost = Math.round(amount * (0.52 + (i % 5) * 0.03));
    const profit = amount - cost;
    const masterId =
      status === "production" || status === "installation" || status === "closed"
        ? masters[i % masters.length]
        : null;
    const responsibleId =
      status === "lead" || status === "application"
        ? "emp_serik"
        : status === "contract" || status === "approval"
          ? "emp_azamat"
          : masterId;

    const orderId = `order_${num}`;
    const date = daysAgo(40 - i);
    const deadline = daysAgo(-(10 + (i % 15)));

    orders.push({
      id: orderId,
      companyId: CID,
      number: String(num),
      clientId: client.id,
      source: client.source,
      status,
      amount,
      cost,
      profit,
      date,
      deadline,
      responsibleId,
      masterId,
      description: orderDescriptions[i],
      comment: i % 4 === 0 ? "Клиент просит ускорить сроки" : null,
      furnitureUnits: 1 + (i % 5),
      materialsNote: "ЛДСП Egger, кромка ПВХ 0,4/2 мм",
      hardwareNote: i % 3 === 0 ? "Blum / Hettich" : "Стандартная фурнитура",
      media: [],
      createdAt: isoDaysAgo(40 - i, 9, 15),
      updatedAt: isoDaysAgo(Math.max(0, 10 - (i % 8)), 14, 20),
    });

    if (
      status === "production" ||
      status === "installation" ||
      status === "closed"
    ) {
      const keys: ProductionStageKey[] =
        status === "closed"
          ? ["cutting", "edging", "drilling", "assembly", "installation"]
          : status === "installation"
            ? ["cutting", "edging", "drilling", "assembly", "installation"]
            : ["cutting", "edging", "drilling", "assembly", "installation"];

      const statuses: StageStatus[] =
        status === "closed"
          ? ["done", "done", "done", "done", "done"]
          : status === "installation"
            ? ["done", "done", "done", "done", "in_progress"]
            : i % 2 === 0
              ? ["done", "done", "done", "in_progress", "pending"]
              : ["done", "done", "in_progress", "pending", "pending"];

      orderStages.push(...makeStages(orderId, keys, statuses, masterId));
    }

    if (i === 12 || i === 16 || status === "production") {
      const items = [
        { cat: "material" as const, name: "ЛДСП раскрой согласован", qty: 1, unit: "шт", done: true },
        { cat: "hardware" as const, name: "Петли полунакладные", qty: 12, unit: "шт", done: i % 2 === 0 },
        { cat: "hardware" as const, name: "Направляющие полного выдвижения", qty: 6, unit: "пар", done: false },
        { cat: "qc" as const, name: "Проверка геометрии корпусов", qty: 1, unit: "шт", done: false },
      ];
      items.forEach((it, idx) => {
        checklistItems.push({
          id: `chk_${num}_${idx}`,
          companyId: CID,
          orderId,
          category: it.cat,
          name: it.name,
          quantity: it.qty,
          unit: it.unit,
          done: it.done,
          responsibleId: masterId,
          comment: null,
        });
      });
    }
  }

  // Canonical order 1028
  const client1028 = clients[0];
  const order1028Id = "order_1028";
  orders.push({
    id: order1028Id,
    companyId: CID,
    number: "1028",
    clientId: client1028.id,
    source: "instagram",
    status: "production",
    amount: 1850000,
    cost: 1100000,
    profit: 750000,
    date: daysAgo(18),
    deadline: daysAgo(-12),
    responsibleId: "emp_serik",
    masterId: "emp_daniyar",
    description:
      "Кухонный гарнитур на заказ: верхние и нижние модули, угловая секция, столешница постформинг, фасады ЛДСП Egger W980 ST2",
    comment: "Клиент Айгуль — эталонный заказ для демо. Монтаж после сборки.",
    furnitureUnits: 4,
    materialsNote: "ЛДСП 16 мм Egger, МДФ 16 мм под эмаль (фартук), фанера 15 мм дно ящиков",
    hardwareNote: "Blum Clip top, Tandembox, ручки Gola",
    media: [],
    createdAt: isoDaysAgo(18, 10, 0),
    updatedAt: now,
  });

  const stages1028Keys: ProductionStageKey[] = [
    "cutting",
    "edging",
    "drilling",
    "assembly",
    "installation",
  ];
  const stages1028Statuses: StageStatus[] = [
    "done",
    "done",
    "done",
    "in_progress",
    "pending",
  ];
  orderStages.push(
    ...makeStages(order1028Id, stages1028Keys, stages1028Statuses, "emp_daniyar"),
  );

  const checklist1028: Omit<ChecklistItem, "id">[] = [
    { companyId: CID, orderId: order1028Id, category: "material", name: "ЛДСП Egger W980 — раскрой", quantity: 12, unit: "лист", done: true, responsibleId: "emp_daniyar", comment: null },
    { companyId: CID, orderId: order1028Id, category: "material", name: "Кромка ПВХ 2 мм белая", quantity: 80, unit: "м", done: true, responsibleId: "emp_daniyar", comment: null },
    { companyId: CID, orderId: order1028Id, category: "material", name: "Столешница постформинг 38 мм", quantity: 4, unit: "м.п.", done: true, responsibleId: "emp_daniyar", comment: null },
    { companyId: CID, orderId: order1028Id, category: "hardware", name: "Петли Blum Clip top", quantity: 28, unit: "шт", done: true, responsibleId: "emp_daniyar", comment: null },
    { companyId: CID, orderId: order1028Id, category: "hardware", name: "Направляющие Tandembox", quantity: 10, unit: "пар", done: true, responsibleId: "emp_daniyar", comment: null },
    { companyId: CID, orderId: order1028Id, category: "hardware", name: "Профиль Gola горизонтальный", quantity: 6, unit: "м.п.", done: true, responsibleId: "emp_asylkhan", comment: null },
    { companyId: CID, orderId: order1028Id, category: "hardware", name: "Ножки регулируемые", quantity: 24, unit: "шт", done: false, responsibleId: "emp_daniyar", comment: "Ожидаем поставку" },
    { companyId: CID, orderId: order1028Id, category: "qc", name: "Проверка присадки под Blum", quantity: 1, unit: "комплект", done: true, responsibleId: "emp_daniyar", comment: null },
    { companyId: CID, orderId: order1028Id, category: "qc", name: "Сборка корпусов без перекосов", quantity: 4, unit: "шт", done: false, responsibleId: "emp_daniyar", comment: "В работе" },
    { companyId: CID, orderId: order1028Id, category: "other", name: "Упаковка модулей к монтажу", quantity: 4, unit: "шт", done: false, responsibleId: "emp_daniyar", comment: null },
    { companyId: CID, orderId: order1028Id, category: "other", name: "Согласовать дату монтажа с клиентом", quantity: 1, unit: "шт", done: false, responsibleId: "emp_serik", comment: null },
  ];
  checklist1028.forEach((item, idx) => {
    checklistItems.push({ ...item, id: `chk_1028_${idx}` });
  });

  // Update client aggregates
  for (const order of orders) {
    const client = clients.find((c) => c.id === order.clientId);
    if (!client) continue;
    client.ordersCount += 1;
    client.totalAmount += order.amount;
    if (!client.lastOrderAt || order.date > client.lastOrderAt) {
      client.lastOrderAt = order.date;
    }
  }

  const materials: Material[] = [
    { id: "mat_ldsp_white", companyId: CID, category: "sheet", name: "ЛДСП Egger W980 ST2 16 мм", sku: "LDSP-W980-16", unit: "лист", quantity: 48, minStock: 20, unitCost: 18500 },
    { id: "mat_ldsp_oak", companyId: CID, category: "sheet", name: "ЛДСП Egger H3131 Дуб 16 мм", sku: "LDSP-H3131-16", unit: "лист", quantity: 12, minStock: 15, unitCost: 21000 },
    { id: "mat_mdf_16", companyId: CID, category: "sheet", name: "МДФ 16 мм шлифованный", sku: "MDF-16", unit: "лист", quantity: 22, minStock: 10, unitCost: 14000 },
    { id: "mat_plywood", companyId: CID, category: "sheet", name: "Фанера берёзовая 15 мм", sku: "PLY-15", unit: "лист", quantity: 8, minStock: 10, unitCost: 16500 },
    { id: "mat_dsp_raw", companyId: CID, category: "sheet", name: "ДСП шлифованная 16 мм", sku: "DSP-16", unit: "лист", quantity: 30, minStock: 12, unitCost: 9500 },
    { id: "mat_hinge_blum", companyId: CID, category: "hardware", name: "Петля Blum Clip top", sku: "BLUM-CLIP", unit: "шт", quantity: 180, minStock: 100, unitCost: 950 },
    { id: "mat_runner_tb", companyId: CID, category: "hardware", name: "Направляющие Tandembox 500", sku: "TB-500", unit: "пар", quantity: 35, minStock: 20, unitCost: 12500 },
    { id: "mat_handle_gola", companyId: CID, category: "hardware", name: "Профиль Gola C чёрный", sku: "GOLA-C-BLK", unit: "м.п.", quantity: 18, minStock: 25, unitCost: 3200 },
    { id: "mat_confirmat", companyId: CID, category: "hardware", name: "Конфирмат 7×50", sku: "CONF-750", unit: "уп", quantity: 40, minStock: 15, unitCost: 1800 },
    { id: "mat_edge_04", companyId: CID, category: "consumables", name: "Кромка ПВХ 0,4 мм белая", sku: "EDGE-04-W", unit: "м", quantity: 250, minStock: 100, unitCost: 45 },
    { id: "mat_edge_2", companyId: CID, category: "consumables", name: "Кромка ПВХ 2 мм белая", sku: "EDGE-2-W", unit: "м", quantity: 90, minStock: 80, unitCost: 95 },
    { id: "mat_glue", companyId: CID, category: "consumables", name: "Клей-расплав EVA", sku: "GLUE-EVA", unit: "кг", quantity: 6, minStock: 8, unitCost: 4500 },
    { id: "mat_sandpaper", companyId: CID, category: "consumables", name: "Шлифлента P120", sku: "SAND-120", unit: "шт", quantity: 15, minStock: 10, unitCost: 1200 },
    { id: "mat_saw_blade", companyId: CID, category: "machine", name: "Пильный диск 300 мм", sku: "BLADE-300", unit: "шт", quantity: 2, minStock: 2, unitCost: 45000 },
    { id: "mat_router_bit", companyId: CID, category: "machine", name: "Фреза пазовая 8 мм", sku: "BIT-8", unit: "шт", quantity: 1, minStock: 3, unitCost: 8500 },
    { id: "mat_vacuum_bag", companyId: CID, category: "machine", name: "Вакуумный мешок", sku: "VAC-BAG", unit: "шт", quantity: 4, minStock: 2, unitCost: 12000 },
  ];

  const inventoryMovements: InventoryMovement[] = [
    {
      id: "mov_001",
      companyId: CID,
      materialId: "mat_ldsp_white",
      type: "in",
      quantity: 40,
      unit: "лист",
      date: daysAgo(25),
      responsibleId: "emp_serik",
      orderId: null,
      comment: "Поступление со склада Egger Almaty",
    },
    {
      id: "mov_002",
      companyId: CID,
      materialId: "mat_ldsp_white",
      type: "out",
      quantity: 12,
      unit: "лист",
      date: daysAgo(16),
      responsibleId: "emp_daniyar",
      orderId: order1028Id,
      comment: "Списание на заказ 1028",
    },
    {
      id: "mov_003",
      companyId: CID,
      materialId: "mat_hinge_blum",
      type: "out",
      quantity: 28,
      unit: "шт",
      date: daysAgo(14),
      responsibleId: "emp_daniyar",
      orderId: order1028Id,
      comment: "Фурнитура на заказ 1028",
    },
    {
      id: "mov_004",
      companyId: CID,
      materialId: "mat_runner_tb",
      type: "out",
      quantity: 10,
      unit: "пар",
      date: daysAgo(14),
      responsibleId: "emp_daniyar",
      orderId: order1028Id,
      comment: "Tandembox на заказ 1028",
    },
    {
      id: "mov_005",
      companyId: CID,
      materialId: "mat_edge_2",
      type: "out",
      quantity: 80,
      unit: "м",
      date: daysAgo(15),
      responsibleId: "emp_asylkhan",
      orderId: order1028Id,
      comment: "Кромка на заказ 1028",
    },
    {
      id: "mov_006",
      companyId: CID,
      materialId: "mat_glue",
      type: "out",
      quantity: 2,
      unit: "кг",
      date: daysAgo(10),
      responsibleId: "emp_kuanysh",
      orderId: "order_1013",
      comment: "Клей на кромкооблицовочный",
    },
    {
      id: "mov_007",
      companyId: CID,
      materialId: "mat_handle_gola",
      type: "in",
      quantity: 30,
      unit: "м.п.",
      date: daysAgo(20),
      responsibleId: "emp_serik",
      orderId: null,
      comment: "Закуп Gola",
    },
    {
      id: "mov_008",
      companyId: CID,
      materialId: "mat_ldsp_oak",
      type: "out",
      quantity: 6,
      unit: "лист",
      date: daysAgo(8),
      responsibleId: "emp_dauren",
      orderId: "order_1016",
      comment: "ЛДСП дуб на заказ 1016",
    },
    {
      id: "mov_009",
      companyId: CID,
      materialId: "mat_router_bit",
      type: "adjustment",
      quantity: -1,
      unit: "шт",
      date: daysAgo(5),
      responsibleId: "emp_ruslan",
      orderId: null,
      comment: "Списание изношенной фрезы",
    },
    {
      id: "mov_010",
      companyId: CID,
      materialId: "mat_confirmat",
      type: "transfer",
      quantity: 5,
      unit: "уп",
      date: daysAgo(3),
      responsibleId: "emp_bekzat",
      orderId: null,
      comment: "Перемещение на участок сборки",
    },
  ];

  const assemblyStage1028 = orderStages.find(
    (s) => s.orderId === order1028Id && s.key === "assembly",
  )!;

  const tasks: Task[] = [
    {
      id: "task_sys_1028_assembly",
      companyId: CID,
      title: "Сборка корпусов — заказ 1028",
      description: "Завершить сборку 4 модулей кухни, проверить диагонали",
      assigneeId: "emp_daniyar",
      orderId: order1028Id,
      stageId: assemblyStage1028.id,
      deadline: today,
      priority: "high",
      status: "in_progress",
      system: true,
      createdAt: isoDaysAgo(3, 9, 0),
    },
    {
      id: "task_sys_1017_install",
      companyId: CID,
      title: "Монтаж — заказ 1017",
      description: "Выезд на объект, установка детской кровати",
      assigneeId: "emp_asylkhan",
      orderId: "order_1017",
      stageId: orderStages.find((s) => s.orderId === "order_1017" && s.key === "installation")?.id ?? null,
      deadline: today,
      priority: "urgent",
      status: "todo",
      system: true,
      createdAt: isoDaysAgo(1, 16, 0),
    },
    {
      id: "task_manual_measure",
      companyId: CID,
      title: "Замер на объекте — Индира Рахимова",
      description: "Новостройка ЖК Алатау, кв. 84. Взять лазер и образцы",
      assigneeId: "emp_azamat",
      orderId: "order_1015",
      stageId: null,
      deadline: today,
      priority: "high",
      status: "todo",
      system: false,
      createdAt: isoDaysAgo(2, 11, 0),
    },
    {
      id: "task_manual_purchase",
      companyId: CID,
      title: "Заказать ножки и Gola",
      description: "Остаток Gola ниже минимума, ножки для 1028",
      assigneeId: "emp_serik",
      orderId: order1028Id,
      stageId: null,
      deadline: daysAgo(-1),
      priority: "medium",
      status: "todo",
      system: false,
      createdAt: isoDaysAgo(1, 10, 30),
    },
    {
      id: "task_sys_delivery",
      companyId: CID,
      title: "Доставка материалов на цех",
      description: "Забрать ЛДСП со склада поставщика",
      assigneeId: "emp_bekzat",
      orderId: null,
      stageId: null,
      deadline: today,
      priority: "medium",
      status: "todo",
      system: true,
      createdAt: isoDaysAgo(0, 8, 0),
    },
    {
      id: "task_manual_kp",
      companyId: CID,
      title: "Подготовить КП по кухне с островом",
      description: "Клиент Гульнара — согласовать комплектацию",
      assigneeId: "emp_azamat",
      orderId: "order_1011",
      stageId: null,
      deadline: daysAgo(-3),
      priority: "medium",
      status: "done",
      system: false,
      createdAt: isoDaysAgo(7, 12, 0),
    },
    {
      id: "task_overdue_qc",
      companyId: CID,
      title: "ОТК по заказу 1013",
      description: "Проверить качество закатки на угловой кухне",
      assigneeId: "emp_kuanysh",
      orderId: "order_1013",
      stageId: null,
      deadline: daysAgo(2),
      priority: "high",
      status: "overdue",
      system: false,
      createdAt: isoDaysAgo(5, 15, 0),
    },
    {
      id: generateId("task"),
      companyId: CID,
      title: "Сфотографировать готовый заказ 1020",
      description: "Для портфолио Instagram",
      assigneeId: "emp_stanislav",
      orderId: "order_1020",
      stageId: null,
      deadline: daysAgo(-2),
      priority: "low",
      status: "todo",
      system: false,
      createdAt: isoDaysAgo(1, 17, 0),
    },
  ];

  const reports: EmployeeReport[] = [
    {
      id: "rep_1028_daniyar",
      companyId: CID,
      orderId: order1028Id,
      stageId: assemblyStage1028.id,
      employeeId: "emp_daniyar",
      whatDone:
        "Собрал 3 из 4 корпусов нижнего ряда. Присадка под Blum выполнена, диагонали в норме. Четвёртый модуль (угловой) в работе.",
      problems: "Не хватает 4 регулируемых ножек — заказ у поставщика.",
      materials: "Конфирмат 2 уп., петли Blum 28 шт. уже установлены на фасады.",
      unitsDone: 3,
      comment: "Завтра закончу угол и начну навеску фасадов.",
      media: [],
      createdAt: isoDaysAgo(0, 13, 45),
    },
    {
      id: "rep_1017_asylkhan",
      companyId: CID,
      orderId: "order_1017",
      stageId:
        orderStages.find((s) => s.orderId === "order_1017" && s.key === "assembly")
          ?.id ?? null,
      employeeId: "emp_asylkhan",
      whatDone: "Сборка детской кровати завершена, упакована к монтажу.",
      problems: null,
      materials: "Крепёж в комплекте.",
      unitsDone: 1,
      comment: "Готово к выезду.",
      media: [],
      createdAt: isoDaysAgo(1, 18, 10),
    },
    {
      id: "rep_1013_kuanysh",
      companyId: CID,
      orderId: "order_1013",
      stageId:
        orderStages.find((s) => s.orderId === "order_1013" && s.key === "edging")
          ?.id ?? null,
      employeeId: "emp_kuanysh",
      whatDone: "Закатка кромки 2 мм на всех деталях угловой кухни.",
      problems: "На двух торцах лёгкий скол — переклеили.",
      materials: "Кромка ПВХ 2 мм — 45 м, клей EVA 1 кг.",
      unitsDone: 1,
      comment: null,
      media: [],
      createdAt: isoDaysAgo(4, 16, 20),
    },
  ];

  const qrTokenId = "qr_active_001";
  const attendanceQr: AttendanceQR[] = [
    {
      id: qrTokenId,
      companyId: CID,
      token: "TAV-QR-" + today.replace(/-/g, "") + "-A7F3",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      usedAt: null,
      employeeId: null,
      location: "Цех Mebel Demo, Алматы",
      createdAt: todayAt(8, 0),
    },
  ];

  const attendance: Attendance[] = [
    {
      id: "att_daniyar",
      companyId: CID,
      employeeId: "emp_daniyar",
      date: today,
      checkInAt: todayAt(8, 52),
      lateMinutes: 0,
      penaltyAmount: 0,
      qrTokenId,
      location: "Цех Mebel Demo, Алматы",
    },
    {
      id: "att_asylkhan",
      companyId: CID,
      employeeId: "emp_asylkhan",
      date: today,
      checkInAt: todayAt(8, 58),
      lateMinutes: 0,
      penaltyAmount: 0,
      qrTokenId,
      location: "Цех Mebel Demo, Алматы",
    },
    {
      id: "att_kuanysh",
      companyId: CID,
      employeeId: "emp_kuanysh",
      date: today,
      checkInAt: todayAt(9, 17),
      lateMinutes: 17,
      penaltyAmount: 20000,
      qrTokenId,
      location: "Цех Mebel Demo, Алматы",
    },
    {
      id: "att_dauren",
      companyId: CID,
      employeeId: "emp_dauren",
      date: today,
      checkInAt: todayAt(8, 55),
      lateMinutes: 0,
      penaltyAmount: 0,
      qrTokenId,
      location: "Цех Mebel Demo, Алматы",
    },
    {
      id: "att_bekzat",
      companyId: CID,
      employeeId: "emp_bekzat",
      date: today,
      checkInAt: todayAt(8, 45),
      lateMinutes: 0,
      penaltyAmount: 0,
      qrTokenId,
      location: "Цех Mebel Demo, Алматы",
    },
    {
      id: "att_azamat",
      companyId: CID,
      employeeId: "emp_azamat",
      date: today,
      checkInAt: todayAt(9, 2),
      lateMinutes: 0,
      penaltyAmount: 0,
      qrTokenId,
      location: "Офис Mebel Demo, Алматы",
    },
    {
      id: "att_serik",
      companyId: CID,
      employeeId: "emp_serik",
      date: today,
      checkInAt: todayAt(8, 40),
      lateMinutes: 0,
      penaltyAmount: 0,
      qrTokenId,
      location: "Офис Mebel Demo, Алматы",
    },
  ];

  // Jasulan on 1028: earned = 1850000 * 18% = 333000; max advance 30% = 99900
  const daniyarEarned1028 = Math.round(1850000 * 0.18);
  const daniyarMaxAdvance = Math.round(daniyarEarned1028 * 0.3);
  const daniyarAdvanceAmount = 50000;

  const advances: Advance[] = [
    {
      id: "adv_daniyar_1028",
      companyId: CID,
      employeeId: "emp_daniyar",
      orderId: order1028Id,
      amount: daniyarAdvanceAmount,
      maxAllowed: daniyarMaxAdvance,
      date: daysAgo(5),
      comment: "Аванс по заказу 1028 (в пределах 30%)",
      authorId: "user_serik",
      status: "issued",
      paymentMethod: "cash",
      receipt: null,
    },
    {
      id: "adv_asylkhan",
      companyId: CID,
      employeeId: "emp_asylkhan",
      orderId: "order_1017",
      amount: 30000,
      maxAllowed: Math.round(350000 * 0.18 * 0.3),
      date: daysAgo(3),
      comment: "Аванс под монтаж",
      authorId: "user_serik",
      status: "issued",
      paymentMethod: "cashless",
      receipt: null,
    },
  ];

  const penalties: Penalty[] = [
    {
      id: "pen_kuanysh_late",
      companyId: CID,
      employeeId: "emp_kuanysh",
      reason: "Опоздание на 17 минут (приход 09:17)",
      amount: 20000,
      date: today,
      comment: "Автоштраф по правилам компании",
      authorId: "user_ruslan",
      status: "active",
      auto: true,
    },
    {
      id: "pen_doszhan_qc",
      companyId: CID,
      employeeId: "emp_doszhan",
      reason: "Переделка после замечания ОТК",
      amount: 15000,
      date: daysAgo(7),
      comment: "Скол кромки на фасаде",
      authorId: "user_serik",
      status: "active",
      auto: false,
    },
  ];

  const salaries: SalaryRecord[] = [
    {
      id: "sal_daniyar",
      companyId: CID,
      employeeId: "emp_daniyar",
      orderId: order1028Id,
      period,
      baseAmount: daniyarEarned1028,
      bonus: 0,
      penalties: 0,
      advances: daniyarAdvanceAmount,
      netAmount: daniyarEarned1028 - daniyarAdvanceAmount,
      status: "pending",
    },
    {
      id: "sal_bekzat",
      companyId: CID,
      employeeId: "emp_bekzat",
      orderId: null,
      period,
      baseAmount: 270000,
      bonus: 10000,
      penalties: 0,
      advances: 0,
      netAmount: 280000,
      status: "pending",
    },
    {
      id: "sal_stanislav",
      companyId: CID,
      employeeId: "emp_stanislav",
      orderId: null,
      period,
      baseAmount: 250000,
      bonus: 0,
      penalties: 0,
      advances: 0,
      netAmount: 250000,
      status: "pending",
    },
    {
      id: "sal_azamat",
      companyId: CID,
      employeeId: "emp_azamat",
      orderId: null,
      period,
      baseAmount: 300000,
      bonus: 25000,
      penalties: 0,
      advances: 0,
      netAmount: 325000,
      status: "pending",
    },
    {
      id: "sal_kuanysh",
      companyId: CID,
      employeeId: "emp_kuanysh",
      orderId: null,
      period,
      baseAmount: Math.round(1250000 * 0.18),
      bonus: 0,
      penalties: 20000,
      advances: 0,
      netAmount: Math.round(1250000 * 0.18) - 20000,
      status: "pending",
    },
  ];

  const settings: CompanySettings[] = [
    {
      companyId: CID,
      workStart: "09:00",
      workEnd: "18:00",
      workDays: [1, 2, 3, 4, 5, 6],
      lateThresholdMinutes: 0,
      latePenaltyAmount: 20000,
      advanceMaxPercent: 30,
      defaultAssemblerPercent: 15,
      qrRotateSeconds: 60,
    },
    {
      companyId: "company_003",
      workStart: "09:00",
      workEnd: "18:00",
      workDays: [1, 2, 3, 4, 5, 6],
      lateThresholdMinutes: 0,
      latePenaltyAmount: 20000,
      advanceMaxPercent: 30,
      defaultAssemblerPercent: 15,
      qrRotateSeconds: 60,
    },
  ];

  const notifications: Notification[] = [
    {
      id: "notif_001",
      companyId: CID,
      userId: "user_aidos",
      type: "new_order",
      title: "Новый заказ 1028",
      body: "Айгуль Сатпаева — кухня на 1 850 000 ₸, мастер Данияр",
      href: "/orders/1028",
      read: false,
      createdAt: isoDaysAgo(18, 10, 5),
    },
    {
      id: "notif_002",
      companyId: CID,
      userId: "user_aidos",
      type: "stage_change",
      title: "Заказ 1028 — сборка",
      body: "Этап «Сборка» переведён в работу",
      href: "/orders/1028",
      read: false,
      createdAt: isoDaysAgo(2, 9, 30),
    },
    {
      id: "notif_003",
      companyId: CID,
      userId: "user_aidos",
      type: "new_report",
      title: "Отчёт Данияра",
      body: "Собрано 3 из 4 модулей по заказу 1028",
      href: "/reports",
      read: false,
      createdAt: isoDaysAgo(0, 13, 50),
    },
    {
      id: "notif_004",
      companyId: CID,
      userId: "user_aidos",
      type: "lateness",
      title: "Опоздание",
      body: "Куаныш пришёл в 09:17 (−20 000 ₸)",
      href: "/attendance",
      read: false,
      createdAt: todayAt(9, 18),
    },
    {
      id: "notif_005",
      companyId: CID,
      userId: "user_aidos",
      type: "low_stock",
      title: "Низкий остаток",
      body: "ЛДСП дуб и профиль Gola ниже минимума",
      href: "/warehouse",
      read: true,
      createdAt: isoDaysAgo(1, 11, 0),
    },
    {
      id: "notif_006",
      companyId: CID,
      userId: "user_aidos",
      type: "new_advance",
      title: "Аванс выдан",
      body: "Данияру 50 000 ₸ по заказу 1028",
      href: "/payroll",
      read: true,
      createdAt: isoDaysAgo(5, 14, 0),
    },
    {
      id: "notif_007",
      companyId: CID,
      userId: "user_aidos",
      type: "task_overdue",
      title: "Просроченная задача",
      body: "ОТК по заказу 1013 — Куаныш",
      href: "/tasks",
      read: false,
      createdAt: isoDaysAgo(1, 9, 0),
    },
    {
      id: "notif_008",
      companyId: CID,
      userId: "user_aidos",
      type: "status_change",
      title: "Заказ 1017 на монтаже",
      body: "Статус изменён на «Монтаж»",
      href: "/orders/1017",
      read: true,
      createdAt: isoDaysAgo(2, 16, 40),
    },
  ];

  const activityLog: ActivityLog[] = [
    {
      id: "act_001",
      companyId: CID,
      actorId: "user_serik",
      actorName: "Серик Умаров",
      action: "Создал заказ №1028",
      entityType: "order",
      entityId: order1028Id,
      createdAt: isoDaysAgo(18, 10, 0),
    },
    {
      id: "act_002",
      companyId: CID,
      actorId: "user_azamat",
      actorName: "Азамат Рахимов",
      action: "Утвердил спецификацию по заказу №1028",
      entityType: "order",
      entityId: order1028Id,
      createdAt: isoDaysAgo(17, 15, 20),
    },
    {
      id: "act_003",
      companyId: CID,
      actorId: "user_daniyar",
      actorName: "Данияр Ахметов",
      action: "Завершил этап «Распил» по заказу №1028",
      entityType: "order_stage",
      entityId: "stage_order_1028_cutting",
      createdAt: isoDaysAgo(12, 17, 0),
    },
    {
      id: "act_004",
      companyId: CID,
      actorId: "user_daniyar",
      actorName: "Данияр Ахметов",
      action: "Завершил этап «Закатка» по заказу №1028",
      entityType: "order_stage",
      entityId: "stage_order_1028_edging",
      createdAt: isoDaysAgo(10, 16, 30),
    },
    {
      id: "act_005",
      companyId: CID,
      actorId: "user_daniyar",
      actorName: "Данияр Ахметов",
      action: "Завершил этап «Присадка» по заказу №1028",
      entityType: "order_stage",
      entityId: "stage_order_1028_drilling",
      createdAt: isoDaysAgo(4, 18, 10),
    },
    {
      id: "act_006",
      companyId: CID,
      actorId: "user_daniyar",
      actorName: "Данияр Ахметов",
      action: "Начал этап «Сборка» по заказу №1028",
      entityType: "order_stage",
      entityId: assemblyStage1028.id,
      createdAt: isoDaysAgo(2, 9, 15),
    },
    {
      id: "act_007",
      companyId: CID,
      actorId: "user_serik",
      actorName: "Серик Умаров",
      action: "Выдал аванс Данияру 50 000 ₸",
      entityType: "advance",
      entityId: "adv_daniyar_1028",
      createdAt: isoDaysAgo(5, 14, 5),
    },
    {
      id: "act_008",
      companyId: CID,
      actorId: "user_ruslan",
      actorName: "Руслан Назаров",
      action: "Зафиксировал опоздание Куаныша (штраф 20 000 ₸)",
      entityType: "penalty",
      entityId: "pen_kuanysh_late",
      createdAt: todayAt(9, 20),
    },
    {
      id: "act_009",
      companyId: CID,
      actorId: "user_daniyar",
      actorName: "Данияр Ахметов",
      action: "Отправил отчёт по заказу №1028",
      entityType: "report",
      entityId: "rep_1028_daniyar",
      createdAt: isoDaysAgo(0, 13, 46),
    },
    {
      id: "act_010",
      companyId: CID,
      actorId: "user_aidos",
      actorName: "Айдос Демов",
      action: "Просмотрел сводку по производству",
      entityType: "dashboard",
      entityId: null,
      createdAt: todayAt(8, 30),
    },
  ];

  const calculatorProjects: CalculatorProject[] = [
    {
      id: "calc_001",
      companyId: CID,
      clientId: client1028.id,
      name: "Кухня Айгуль — предварительный расчёт",
      furnitureType: "Кухня",
      width: 3200,
      height: 2400,
      depth: 600,
      quantity: 1,
      materialCost: 420000,
      laborCost: 280000,
      hardwareCost: 195000,
      facadeCost: 150000,
      extrasCost: 45000,
      installCost: 80000,
      deliveryCost: 25000,
      markupPercent: 35,
      total: 1850000,
      createdAt: isoDaysAgo(20, 11, 0),
    },
    {
      id: "calc_002",
      companyId: CID,
      clientId: "client_011",
      name: "Кухня с островом — Гульнара",
      furnitureType: "Кухня с островом",
      width: 4500,
      height: 2400,
      depth: 600,
      quantity: 1,
      materialCost: 580000,
      laborCost: 350000,
      hardwareCost: 240000,
      facadeCost: 220000,
      extrasCost: 90000,
      installCost: 120000,
      deliveryCost: 35000,
      markupPercent: 40,
      total: 2289000,
      createdAt: isoDaysAgo(12, 14, 30),
    },
  ];

  const commercialProposals: CommercialProposal[] = [
    {
      id: "kp_001",
      companyId: CID,
      calculatorId: "calc_001",
      clientId: client1028.id,
      number: "КП-2026-028",
      items: [
        { name: "Кухонный гарнитур (4 модуля)", qty: 1, specs: "ЛДСП Egger W980, Blum", price: 1650000 },
        { name: "Столешница постформинг", qty: 4, specs: "38 мм, раскрой", price: 120000 },
        { name: "Доставка и монтаж", qty: 1, specs: "Алматы", price: 80000 },
      ],
      total: 1850000,
      terms: "Предоплата 50%, остаток после монтажа. Гарантия 12 месяцев.",
      deadlineDays: 30,
      createdAt: isoDaysAgo(19, 16, 0),
    },
  ];

  const data: AppData = {
    companies,
    users,
    employees,
    clients,
    orders,
    orderStages,
    checklistItems,
    materials,
    inventoryMovements,
    tasks,
    reports,
    attendance,
    attendanceQr,
    salaries,
    salaryPayments: [],
    advances,
    penalties,
    settings,
    userSettings: [],
    notifications,
    activityLog,
    orderAuditLogs: [],
    calculatorProjects,
    commercialProposals,
    atelierCornicePrices: [],
    atelierFabrics: [],
    atelierAssemblyCoeffs: [],
    atelierCoverPrices: [],
    atelierPillowPrices: [],
    atelierAccessoryPrices: [],
    atelierRollerPrices: [],
    atelierInstallPrices: [],
    atelierServicePrices: [],
    atelierLabels: [],
    measurements: [],
    clientMeasurements: [],
    galleryFolders: [],
    galleryPhotos: [],
    furniturePriceItems: buildFurniturePriceItems(),
    cashEntries: [],
    purchases: [],
    orderExpenses: [],
    expenseCategories: [],
    pushSubscriptions: [],
    grokConnectors: [],
    grokLogs: [],
    migrations: [],
  };
  appendAtelierToSeed(data);
  ensureAtelierData(data);
  return data;
}

/** `next build` also runs with NODE_ENV=production and must leave users of the local database alone. */
function syncUsers(data: AppData): boolean {
  if (isProductionRuntime) return secureProductionUsers(data);
  if (!isProduction) return syncDemoAccounts(data);
  return false;
}

export function ensureDatabase(): void {
  const filePath = getDataPath();
  const missing = !fs.existsSync(filePath);
  const empty = !missing && fs.statSync(filePath).size === 0;

  if (missing || empty) {
    resetData();
    const seed = buildSeedData();
    const { afterSave } = runMigrations(seed, filePath);
    syncUsers(seed);
    saveData(seed);
    for (const fn of afterSave) fn();
    return;
  }

  // Migrate existing JSON without wiping Mebel Demo data
  resetData();
  const data = getData();
  const atelierChanged = ensureAtelierData(data);
  const furnitureChanged = ensureFurnitureData(data);
  const migrations = runMigrations(data, filePath);
  const usersChanged = syncUsers(data);
  if (atelierChanged || furnitureChanged || migrations.changed || usersChanged) {
    saveData(data);
  }
  for (const fn of migrations.afterSave) fn();
}
