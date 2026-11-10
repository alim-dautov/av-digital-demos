const almaty = 'Asia/Almaty'

export function formatDateRu(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: almaty,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export function formatTimeRu(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: almaty,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatKzt(amount: number): string {
  const parts = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${parts} ₸`
}
