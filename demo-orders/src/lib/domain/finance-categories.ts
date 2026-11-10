/** Finance ledgers the settings «Очистка данных» button can wipe. Client-safe. */
export const FINANCE_CATEGORIES = ["payments", "cash", "purchases", "orderExpenses", "payroll"] as const;
export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export const FINANCE_CATEGORY_LABELS: Record<FinanceCategory, string> = {
  payments: "Оплаты и предоплаты по заказам",
  cash: "Касса: все приходы и расходы",
  purchases: "Закупы",
  orderExpenses: "Расходы и себестоимость по заказам",
  payroll: "Зарплаты: начисления, выплаты, авансы, штрафы",
};

export type FinanceCounts = Record<FinanceCategory, number>;

