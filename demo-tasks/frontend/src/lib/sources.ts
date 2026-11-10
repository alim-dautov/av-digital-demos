export const LEAD_SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'call', label: 'Звонок' },
  { value: 'site', label: 'Сайт' },
  { value: 'offline', label: 'Офлайн' },
  { value: 'referral', label: 'Рекомендация' },
  { value: 'other', label: 'Другое' },
] as const

export function sourceLabel(value: string) {
  return LEAD_SOURCES.find((s) => s.value === value)?.label ?? value
}
