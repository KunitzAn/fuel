/** `Date` → «2026-09-17» в локальной зоне (toISOString дал бы UTC и мог сдвинуть день). */
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayLocalDate(): string {
  return toLocalDateString(new Date())
}

/** Дата со сдвигом на days дней. */
export function shiftDate(date: string, days: number): string {
  const d = parseLocalDate(date)
  d.setDate(d.getDate() + days)
  return toLocalDateString(d)
}

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

export function formatDateHuman(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
    parseLocalDate(date),
  )
}

/** «суббота, 29 авг.» — заголовок карточки в ленте. */
export function formatDateWithWeekday(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(parseLocalDate(date))
}

/** Заглавная только первая буква: CSS `capitalize` задрал бы и «сент.» в «Сент.». */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Время записи — из createdAt, не из даты дня. */
export function formatTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(isoTimestamp),
  )
}

export function isFutureDate(date: string): boolean {
  return date > todayLocalDate()
}

export interface Month {
  year: number
  /** 1–12, а не как в Date — чтобы не путаться при сборке строки даты. */
  month: number
}

export function currentMonth(): Month {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function addMonths({ year, month }: Month, delta: number): Month {
  const zeroBased = month - 1 + delta
  return {
    year: year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  }
}

export function formatMonthTitle({ year, month }: Month): string {
  const title = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
  // Заглавная только первая буква: CSS `capitalize` задрал бы и «г.» в «Г.»
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export function toDateString({ year, month }: Month, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysInMonth({ year, month }: Month): number {
  return new Date(year, month, 0).getDate()
}

/** Сколько пустых клеток перед первым числом. Неделя начинается с понедельника. */
export function leadingBlanks({ year, month }: Month): number {
  const sunday0 = new Date(year, month - 1, 1).getDay()
  return (sunday0 + 6) % 7
}

export const WEEKDAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** Последние n дней включая сегодня, по возрастанию. */
export function lastNDays(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setHours(12, 0, 0, 0) // полдень: переход на летнее время не сдвинет дату
  d.setDate(d.getDate() - (n - 1))
  for (let i = 0; i < n; i++) {
    out.push(toLocalDateString(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** «16.09» — подпись под столбиком графика. */
export function formatDayShort(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}.${month}`
}
