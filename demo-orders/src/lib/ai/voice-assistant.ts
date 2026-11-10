import { can, canSeeFinance, canSeeOthersPayroll } from "@/lib/rbac";
import { formatKzt } from "@/lib/utils";
import type { AccessOverrides, UserRole } from "@/types";
import type { AccessSubject } from "@/lib/rbac";
import { stageLabel } from "@/types";
import { anyOrderStatusLabel } from "@/lib/services/orders";
import {
  getFinanceSummary,
  getFullAnalytics,
  getLeadSources,
  getOrdersTrend,
} from "@/lib/services/analytics";
import { getLateToday, listAttendance } from "@/lib/services/attendance";
import { getEmployee } from "@/lib/services/employees";
import { getMastersWorkload } from "@/lib/services/employees";
import {
  getLowStock,
  listMaterials,
} from "@/lib/services/inventory";
import {
  getInstallationOrders,
  getOrder,
  getOverdueOrders,
  getTodayOrders,
} from "@/lib/services/orders";
import {
  getAssemblerDebt,
  getEmployeeEarnings,
  listAdvances,
} from "@/lib/services/payroll";
import { listReports } from "@/lib/services/reports";
import { getTodayTasks } from "@/lib/services/tasks";
import { getData } from "@/lib/db";

export type VoiceIntent =
  | "TODAY_ORDERS"
  | "MONTH_SALES"
  | "LATE_TODAY"
  | "STOCK_DSP"
  | "MASTERS_LOAD"
  | "PROFIT"
  | "TODAY_TASKS"
  | "CREATE_ORDER"
  | "OVERDUE_ORDERS"
  | "INSTALLATION_ORDERS"
  | "WEEK_EARNINGS"
  | "MASTERS_DEBT"
  | "LOW_STOCK"
  | "WHO_WORKING"
  | "EMPLOYEE_REPORT"
  | "ADVANCES"
  | "DELAYED_ORDERS"
  | "SHOW_ORDER"
  | "ORDER_STAGE"
  | "UNKNOWN";

export type VoicePanel = {
  type: string;
  title: string;
  data: unknown;
};

export type VoiceResult = {
  intent: VoiceIntent;
  speech: string;
  panel: VoicePanel;
  navigateTo?: string;
};

export type VoiceContext = {
  companyId: string;
  userId: string;
  employeeId?: string | null;
  role: UserRole;
  access?: AccessOverrides | null;
};

type MatchedIntent = {
  intent: VoiceIntent;
  orderNumber?: string;
  employeeName?: string;
};

function normalize(command: string): string {
  return command.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchIntent(command: string): MatchedIntent {
  const c = normalize(command);

  const showOrder = c.match(
    /(?:покажи|открой|найди)\s+заказ\s*(?:№|#)?\s*(\d+)/i,
  );
  if (showOrder) {
    return { intent: "SHOW_ORDER", orderNumber: showOrder[1] };
  }

  const stageOrder = c.match(
    /(?:на каком этапе|какой этап|этап)\s+(?:заказ[а]?)?\s*(?:№|#)?\s*(\d+)/i,
  );
  if (stageOrder || /этап.*заказ|заказ.*этап/.test(c)) {
    const num =
      stageOrder?.[1] ?? c.match(/(?:№|#)?\s*(\d{3,5})/)?.[1] ?? "1028";
    return { intent: "ORDER_STAGE", orderNumber: num };
  }

  if (/заказ(ы)?\s+сегодня|какие\s+заказы\s+сегодня|сегодняшн/.test(c)) {
    return { intent: "TODAY_ORDERS" };
  }
  if (/продаж|выручк.*месяц|за\s+месяц/.test(c) && /продаж|выруч|заказ/.test(c)) {
    return { intent: "MONTH_SALES" };
  }
  if (/опоздал|кто\s+опоздал|опоздани/.test(c)) {
    return { intent: "LATE_TODAY" };
  }
  if (/дсп|лдсп|склад.*лист|сколько\s+на\s+складе/.test(c)) {
    return { intent: "STOCK_DSP" };
  }
  if (/загрузк.*мастер|мастер.*загрузк/.test(c)) {
    return { intent: "MASTERS_LOAD" };
  }
  if (/прибыл/.test(c)) {
    return { intent: "PROFIT" };
  }
  if (/задач.*сегодня|сегодня.*задач/.test(c)) {
    return { intent: "TODAY_TASKS" };
  }
  if (/создать\s+(новый\s+)?заказ|новый\s+заказ/.test(c)) {
    return { intent: "CREATE_ORDER" };
  }
  if (/просроченн/.test(c)) {
    return { intent: "OVERDUE_ORDERS" };
  }
  if (/монтаж/.test(c) && /заказ/.test(c)) {
    return { intent: "INSTALLATION_ORDERS" };
  }
  if (/заработан|заработ|выручк.*недел|за\s+недел/.test(c)) {
    return { intent: "WEEK_EARNINGS" };
  }
  if (/должны\s+мастер|долг.*мастер|мастер.*долж/.test(c)) {
    return { intent: "MASTERS_DEBT" };
  }
  if (/заканчива|низк.*остат|мало\s+на\s+склад|материал.*конч/.test(c)) {
    return { intent: "LOW_STOCK" };
  }
  if (/кто\s+(сейчас\s+)?работа|кто\s+на\s+работе|кто\s+в\s+цеху/.test(c)) {
    return { intent: "WHO_WORKING" };
  }
  if (/отч[её]т.*жасулан|жасулан.*отч|по\s+жасулан/.test(c)) {
    return { intent: "EMPLOYEE_REPORT", employeeName: "Данияр" };
  }
  if (/аванс/.test(c)) {
    return { intent: "ADVANCES" };
  }
  if (/задержива|задержк/.test(c)) {
    return { intent: "DELAYED_ORDERS" };
  }

  return { intent: "UNKNOWN" };
}

function findEmployeeByFirstName(companyId: string, name: string) {
  const q = name.toLowerCase();
  return getData().employees.find(
    (e) =>
      e.companyId === companyId &&
      (e.firstName.toLowerCase() === q ||
        e.fullName.toLowerCase().includes(q)),
  );
}

const INTENT_ACCESS: Record<VoiceIntent, (subject: AccessSubject) => boolean> = {
  TODAY_ORDERS: (r) => can(r, "orders", "read"),
  OVERDUE_ORDERS: (r) => can(r, "orders", "read"),
  DELAYED_ORDERS: (r) => can(r, "orders", "read"),
  INSTALLATION_ORDERS: (r) => can(r, "orders", "read"),
  SHOW_ORDER: (r) => can(r, "orders", "read"),
  ORDER_STAGE: (r) => can(r, "orders", "read"),
  CREATE_ORDER: (r) => can(r, "orders", "write"),
  MONTH_SALES: canSeeFinance,
  PROFIT: canSeeFinance,
  WEEK_EARNINGS: canSeeFinance,
  LATE_TODAY: canSeeOthersPayroll,
  WHO_WORKING: (r) => can(r, "attendance", "read") && canSeeOthersPayroll(r),
  STOCK_DSP: (r) => can(r, "inventory", "read"),
  LOW_STOCK: (r) => can(r, "inventory", "read"),
  MASTERS_LOAD: (r) => can(r, "employees", "read"),
  TODAY_TASKS: (r) => can(r, "tasks", "read"),
  MASTERS_DEBT: canSeeOthersPayroll,
  ADVANCES: canSeeOthersPayroll,
  EMPLOYEE_REPORT: canSeeOthersPayroll,
  UNKNOWN: () => true,
};

export function processVoiceCommand(
  command: string,
  ctx: VoiceContext,
): VoiceResult {
  const matched = matchIntent(command);
  const { companyId } = ctx;

  if (!INTENT_ACCESS[matched.intent](ctx)) {
    return {
      intent: matched.intent,
      speech: "У вас нет доступа к этой информации.",
      panel: { type: "empty", title: "Нет доступа", data: null },
    };
  }

  switch (matched.intent) {
    case "TODAY_ORDERS": {
      const orders = getTodayOrders(companyId);
      const data = getData();
      const rows = orders.map((o) => ({
        number: o.number,
        status: anyOrderStatusLabel(o.status),
        amount: o.amount,
        deadline: o.deadline,
        responsible:
          data.employees.find((e) => e.id === (o.masterId ?? o.responsibleId))
            ?.fullName ?? "—",
        description: o.description,
      }));
      return {
        intent: "TODAY_ORDERS",
        speech:
          orders.length === 0
            ? "На сегодня активных заказов нет."
            : `На сегодня ${orders.length} заказ${orders.length === 1 ? "" : orders.length < 5 ? "а" : "ов"}. Общая сумма ${formatKzt(orders.reduce((s, o) => s + o.amount, 0))}.`,
        panel: {
          type: "orders",
          title: "Заказы сегодня",
          data: rows,
        },
        navigateTo: "/orders",
      };
    }

    case "MONTH_SALES": {
      const finance = getFinanceSummary(companyId);
      const sources = getLeadSources(companyId);
      const trend = getOrdersTrend(companyId, "month");
      return {
        intent: "MONTH_SALES",
        speech: `За месяц выручка ${formatKzt(finance.revenue)}, ${finance.ordersCount} заказов, средний чек ${formatKzt(finance.averageCheck)}, прибыль ${formatKzt(finance.profit)}.`,
        panel: {
          type: "sales",
          title: "Продажи за месяц",
          data: { finance, sources, trend },
        },
        navigateTo: "/analytics",
      };
    }

    case "LATE_TODAY": {
      const late = getLateToday(companyId);
      const speech =
        late.length === 0
          ? "Сегодня опоздавших нет."
          : late
              .map(
                (a) =>
                  `${a.employeeName} пришёл с опозданием ${a.lateMinutes} минут, штраф ${formatKzt(a.penaltyAmount)}.`,
              )
              .join(" ");
      return {
        intent: "LATE_TODAY",
        speech,
        panel: {
          type: "lateness",
          title: "Опоздания сегодня",
          data: late,
        },
        navigateTo: "/attendance",
      };
    }

    case "STOCK_DSP": {
      const sheets = listMaterials(companyId, "sheet");
      const dsp = sheets.filter(
        (m) =>
          /дсп|лдсп|dsp|ldsp/i.test(m.name) || /дсп|лдсп|dsp|ldsp/i.test(m.sku),
      );
      const list = dsp.length ? dsp : sheets;
      const speech = list.length
        ? `На складе листовых материалов: ${list.map((m) => `${m.name} — ${m.quantity} ${m.unit}`).join("; ")}.`
        : "Листовых материалов на складе нет.";
      return {
        intent: "STOCK_DSP",
        speech,
        panel: {
          type: "stock",
          title: "Остатки ДСП / листовых",
          data: list,
        },
        navigateTo: "/warehouse",
      };
    }

    case "MASTERS_LOAD": {
      const load = getMastersWorkload(companyId);
      const speech =
        load.length === 0
          ? "Нет активных мастеров."
          : `Загрузка мастеров: ${load.map((m) => `${m.employee.firstName} — ${m.activeOrders} заказов, ${m.loadPercent}%`).join("; ")}.`;
      return {
        intent: "MASTERS_LOAD",
        speech,
        panel: {
          type: "masters",
          title: "Загрузка мастеров",
          data: load,
        },
        navigateTo: "/employees",
      };
    }

    case "PROFIT": {
      const finance = getFinanceSummary(companyId);
      return {
        intent: "PROFIT",
        speech: `Выручка ${formatKzt(finance.revenue)}, расходы ${formatKzt(finance.expenses)}, зарплаты ${formatKzt(finance.salaries)}, прибыль ${formatKzt(finance.profit)}.`,
        panel: {
          type: "profit",
          title: "Прибыль",
          data: finance,
        },
        navigateTo: "/analytics",
      };
    }

    case "TODAY_TASKS": {
      const tasks = getTodayTasks(companyId, ctx.employeeId);
      return {
        intent: "TODAY_TASKS",
        speech:
          tasks.length === 0
            ? "На сегодня задач нет."
            : `На сегодня ${tasks.length} задач. ${tasks.map((t) => t.title).slice(0, 5).join("; ")}.`,
        panel: {
          type: "tasks",
          title: "Задачи на сегодня",
          data: tasks,
        },
        navigateTo: "/tasks",
      };
    }

    case "CREATE_ORDER":
      return {
        intent: "CREATE_ORDER",
        speech: "Открываю форму создания заказа.",
        panel: {
          type: "navigate",
          title: "Новый заказ",
          data: { action: "create_order" },
        },
        navigateTo: "/orders/new",
      };

    case "OVERDUE_ORDERS":
    case "DELAYED_ORDERS": {
      const overdue = getOverdueOrders(companyId);
      return {
        intent: matched.intent,
        speech:
          overdue.length === 0
            ? "Просроченных заказов нет."
            : `Просрочено ${overdue.length} заказов: ${overdue.map((o) => `№${o.number}`).join(", ")}.`,
        panel: {
          type: "orders",
          title: "Просроченные / задерживающиеся заказы",
          data: overdue,
        },
        navigateTo: "/orders?filter=overdue",
      };
    }

    case "INSTALLATION_ORDERS": {
      const orders = getInstallationOrders(companyId);
      return {
        intent: "INSTALLATION_ORDERS",
        speech:
          orders.length === 0
            ? "Сейчас нет заказов на монтаже."
            : `На монтаже ${orders.length} заказ${orders.length === 1 ? "" : "а"}: ${orders.map((o) => `№${o.number}`).join(", ")}.`,
        panel: {
          type: "orders",
          title: "Заказы на монтаже",
          data: orders,
        },
        navigateTo: "/orders?status=installation",
      };
    }

    case "WEEK_EARNINGS": {
      const trend = getOrdersTrend(companyId, "week");
      const revenue = trend.reduce((s, p) => s + p.revenue, 0);
      const profit = trend.reduce((s, p) => s + p.profit, 0);
      const count = trend.reduce((s, p) => s + p.orders, 0);
      return {
        intent: "WEEK_EARNINGS",
        speech: `За неделю заработано ${formatKzt(revenue)}, прибыль ${formatKzt(profit)}, заказов ${count}.`,
        panel: {
          type: "sales",
          title: "Заработок за неделю",
          data: { revenue, profit, count, trend },
        },
        navigateTo: "/analytics",
      };
    }

    case "MASTERS_DEBT": {
      const debt = getAssemblerDebt(companyId);
      return {
        intent: "MASTERS_DEBT",
        speech: `Мастерам должны ${formatKzt(debt.totalDebt)}. ${debt.masters
          .slice(0, 5)
          .map((m) => `${m.fullName}: ${formatKzt(m.owed)}`)
          .join("; ")}.`,
        panel: {
          type: "payroll",
          title: "Долг мастерам",
          data: debt,
        },
        navigateTo: "/payroll",
      };
    }

    case "LOW_STOCK": {
      const low = getLowStock(companyId);
      return {
        intent: "LOW_STOCK",
        speech:
          low.length === 0
            ? "Все материалы в норме."
            : `Заканчиваются: ${low.map((m) => `${m.name} (${m.quantity} ${m.unit})`).join("; ")}.`,
        panel: {
          type: "stock",
          title: "Низкие остатки",
          data: low,
        },
        navigateTo: "/warehouse?filter=low",
      };
    }

    case "WHO_WORKING": {
      const attendance = listAttendance(companyId);
      const data = getData();
      const rows = attendance.map((a) => ({
        ...a,
        employeeName:
          data.employees.find((e) => e.id === a.employeeId)?.fullName ?? "—",
      }));
      return {
        intent: "WHO_WORKING",
        speech:
          rows.length === 0
            ? "Пока никто не отметился."
            : `Сейчас на работе ${rows.length} человек: ${rows.map((r) => r.employeeName).join(", ")}.`,
        panel: {
          type: "attendance",
          title: "Кто сейчас работает",
          data: rows,
        },
        navigateTo: "/attendance",
      };
    }

    case "EMPLOYEE_REPORT": {
      const emp =
        findEmployeeByFirstName(
          companyId,
          matched.employeeName ?? "Данияр",
        ) ?? findEmployeeByFirstName(companyId, "Данияр");
      if (!emp) {
        return {
          intent: "EMPLOYEE_REPORT",
          speech: "Сотрудник не найден.",
          panel: { type: "empty", title: "Отчёт", data: null },
        };
      }
      const reports = listReports(companyId, { employeeId: emp.id });
      const earnings = getEmployeeEarnings(companyId, emp.id);
      const detail = getEmployee(companyId, emp.id);
      return {
        intent: "EMPLOYEE_REPORT",
        speech:
          reports.length === 0
            ? `По ${emp.firstName} отчётов пока нет. Начислено ${formatKzt(earnings.totalEarned)}.`
            : `Последний отчёт ${emp.firstName}: ${reports[0].whatDone}. Начислено ${formatKzt(earnings.totalEarned)}, к выплате ${formatKzt(earnings.net)}.`,
        panel: {
          type: "employee_report",
          title: `Отчёт — ${emp.fullName}`,
          data: { employee: detail, reports, earnings },
        },
        navigateTo: `/employees/${emp.id}`,
      };
    }

    case "ADVANCES": {
      const advances = listAdvances(companyId);
      const total = advances
        .filter((a) => a.status === "issued")
        .reduce((s, a) => s + a.amount, 0);
      return {
        intent: "ADVANCES",
        speech: `Выдано авансов: ${advances.length} на сумму ${formatKzt(total)}.`,
        panel: {
          type: "advances",
          title: "Авансы",
          data: { advances, total },
        },
        navigateTo: "/payroll",
      };
    }

    case "SHOW_ORDER": {
      const num = matched.orderNumber ?? "1028";
      const order = getOrder(companyId, num);
      if (!order) {
        return {
          intent: "SHOW_ORDER",
          speech: `Заказ ${num} не найден.`,
          panel: { type: "empty", title: `Заказ ${num}`, data: null },
        };
      }
      return {
        intent: "SHOW_ORDER",
        speech: `Заказ ${order.number}: ${order.description}. Статус — ${anyOrderStatusLabel(order.status)}, сумма ${formatKzt(order.amount)}.`,
        panel: {
          type: "order",
          title: `Заказ №${order.number}`,
          data: order,
        },
        navigateTo: `/orders/${order.number}`,
      };
    }

    case "ORDER_STAGE": {
      const num = matched.orderNumber ?? "1028";
      const order = getOrder(companyId, num);
      if (!order) {
        return {
          intent: "ORDER_STAGE",
          speech: `Заказ ${num} не найден.`,
          panel: { type: "empty", title: `Этап заказа ${num}`, data: null },
        };
      }
      const current =
        order.stages.find((s) => s.status === "in_progress") ??
        order.stages.find((s) => s.status === "pending") ??
        order.stages[order.stages.length - 1];
      const label = current
        ? current.label || stageLabel(current.key)
        : anyOrderStatusLabel(order.status);
      return {
        intent: "ORDER_STAGE",
        speech: `Заказ ${order.number} находится на этапе «${label}».`,
        panel: {
          type: "order_stage",
          title: `Этап — заказ №${order.number}`,
          data: { order, currentStage: current, stages: order.stages },
        },
        navigateTo: `/orders/${order.number}`,
      };
    }

    default: {
      const kpis = can(ctx, "analytics", "read")
        ? getFullAnalytics(companyId, "month").kpis
        : null;
      return {
        intent: "UNKNOWN",
        speech:
          "Не расслышал команду. Попробуйте: какие заказы сегодня, кто опоздал, какая прибыль, покажи заказ 1028.",
        panel: {
          type: "help",
          title: "Подсказки",
          data: {
            hints: [
              "Какие заказы сегодня?",
              "Кто опоздал сегодня?",
              "Какая прибыль?",
              "Покажи заказ 1028",
              "Какие материалы заканчиваются?",
            ],
            kpis,
          },
        },
      };
    }
  }
}
