/** Подписи справочных значений для UI (без серверных зависимостей) */
export const SEGMENT_LABELS = { bazaar: "Базар", shop: "Магазин", install: "Монтаж", other: "Другое" } as const;
export type Segment = keyof typeof SEGMENT_LABELS;
export const CP_KINDS = { client: "Клиент", supplier: "Поставщик", both: "Клиент и поставщик" } as const;
export const PAY_METHODS = { cash: "Наличные", kaspi: "Kaspi", transfer: "Перевод" } as const;
export const DEBT_MODES = { default: "Как в настройках", warn: "Предупреждать", block: "Блокировать отгрузку", none: "Не проверять" } as const;
export const ORDER_SOURCES: Record<string, string> = { manual: "вручную", text: "из текста", voice: "голосом", copy: "копия", lead: "из лида", api: "API", whatsapp: "WhatsApp" };
export const ACC_KINDS = { cash: "Наличные", kaspi: "Kaspi", bank: "Банк", other: "Другое" } as const;
export const accKind = (k: string) => ACC_KINDS[k as keyof typeof ACC_KINDS] ?? k;
