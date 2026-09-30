/**
 * Статистика (этап 6, README «Статистика»): сводка по дню для ленты и
 * графиков, периоды и средние. Цель и «потрачено» — теми же функциями,
 * что и дневник (goals.ts), чтобы лента не разошлась с ним.
 */
import { addMonths, daysInMonth, shiftDate, toDateString, weekDates, type Month } from './date'
import type { Activity, DailyActiveEnergy, Entry, GoalSettings } from './db'
import {
  computeDayGoal,
  dayActivity,
  pickGoalSettingsForDate,
  type DayGoal,
} from './goals'
import { scaleByGrams, sumMacros, type Macros } from './nutrition'

export interface StatsSource {
  entries: Pick<Entry, 'date' | 'protein' | 'fat' | 'carbs' | 'kcal' | 'grams' | 'treat'>[]
  activities: Pick<Activity, 'date' | 'kcal'>[]
  health: Pick<DailyActiveEnergy, 'date' | 'totalActiveKcal'>[]
  goalSettings: GoalSettings[]
}

export interface DaySummary {
  date: string
  hasEntries: boolean
  eaten: Macros
  /** Из съеденного — отмеченное как не основная еда (lib/treat.ts). */
  treat: Macros
  /** Цель того дня («Факт») — по версии настроек того дня, с прибавкой за тренировки. */
  goal: DayGoal | null
  /** Покой + активность; без цели покоя не знаем — `null`. */
  spentKcal: number | null
  /** Съедено − потрачено (минус — дефицит). */
  differenceKcal: number | null
}

function groupByDate<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) {
    const list = out.get(r.date)
    if (list) list.push(r)
    else out.set(r.date, [r])
  }
  return out
}

/** Группирует всё один раз — дальше сводка любого дня за O(записей дня). */
export function createDaySummarizer(source: StatsSource): (date: string) => DaySummary {
  const entriesByDate = groupByDate(source.entries)
  const activitiesByDate = groupByDate(source.activities)
  const healthByDate = new Map(source.health.map((h) => [h.date, h]))

  return (date) => {
    const dayEntries = entriesByDate.get(date) ?? []
    const eaten = sumMacros(dayEntries.map((e) => scaleByGrams(e, e.grams)))
    const treat = sumMacros(dayEntries.filter((e) => e.treat === true).map((e) => scaleByGrams(e, e.grams)))
    const settings = pickGoalSettingsForDate(source.goalSettings, date)
    const activity = dayActivity(activitiesByDate.get(date) ?? [], healthByDate.get(date) ?? null)
    // Статистика — всегда «Факт» (владелица): цель с прибавкой за
    // тренировки, без поправки запланированного типа дня
    const goal = settings ? computeDayGoal(settings, activity) : null
    const spentKcal = goal ? goal.spentKcal : null
    return {
      date,
      hasEntries: dayEntries.length > 0,
      eaten,
      treat,
      goal,
      spentKcal,
      differenceKcal: spentKcal === null ? null : eaten.kcal - spentKcal,
    }
  }
}

/** Самая ранняя дата с записью — докуда листается лента. `null` — записей нет. */
export function earliestEntryDate(entries: Pick<Entry, 'date'>[]): string | null {
  let min: string | null = null
  for (const e of entries) if (min === null || e.date < min) min = e.date
  return min
}

/** `count` дат подряд от `from` в прошлое (включая `from`), свежие первыми, не раньше `until`. */
export function datesBackwards(from: string, count: number, until: string): string[] {
  const out: string[] = []
  let d = from
  while (out.length < count && d >= until) {
    out.push(d)
    d = shiftDate(d, -1)
  }
  return out
}

export type StatsPeriodKind = 'week' | 'month' | 'quarter'

export interface StatsPeriod {
  kind: StatsPeriodKind
  dates: string[] // по возрастанию
}

function monthOf(date: string): Month {
  const [year, month] = date.split('-').map(Number)
  return { year: year!, month: month! }
}

function monthDates(m: Month): string[] {
  return Array.from({ length: daysInMonth(m) }, (_, i) => toDateString(m, i + 1))
}

/**
 * Период с понедельника по воскресенье / календарный месяц / три
 * календарных месяца, где последний — текущий. `offset` — сколько
 * периодов назад (стрелки): 0 — текущий, −1 — предыдущий.
 */
export function statsPeriod(kind: StatsPeriodKind, today: string, offset: number): StatsPeriod {
  if (kind === 'week') return { kind, dates: weekDates(shiftDate(today, offset * 7)) }
  if (kind === 'month') return { kind, dates: monthDates(addMonths(monthOf(today), offset)) }
  const last = addMonths(monthOf(today), offset * 3)
  return { kind, dates: [-2, -1, 0].flatMap((d) => monthDates(addMonths(last, d))) }
}

export interface PeriodAverages {
  /** Сколько дней вошло: есть записи и день уже закончился (не сегодня/будущее). */
  days: number
  eaten: Macros | null
  /** Средняя доля «не основной» еды в день — из тех же дней, что и `eaten`. */
  treat: Macros | null
  spentKcal: number | null
  differenceKcal: number | null
  /** Сумма разниц за вошедшие дни — README «итого разница за период». */
  totalDifferenceKcal: number | null
}

/**
 * README: «дни без записей и сегодняшний (незаконченный) день в средние не
 * входят». Потрачено/разница — только по дням, где цель была настроена
 * (без покоя «потрачено» не посчитать), поэтому у них может быть меньше
 * дней, чем у «съедено».
 */
export function periodAverages(summaries: DaySummary[], today: string): PeriodAverages {
  const counted = summaries.filter((s) => s.hasEntries && s.date < today)
  if (counted.length === 0) {
    return { days: 0, eaten: null, treat: null, spentKcal: null, differenceKcal: null, totalDifferenceKcal: null }
  }
  const total = sumMacros(counted.map((s) => s.eaten))
  const treatTotal = sumMacros(counted.map((s) => s.treat))
  const n = counted.length
  const withSpent = counted.filter((s) => s.spentKcal !== null)
  const spentSum = withSpent.reduce((sum, s) => sum + s.spentKcal!, 0)
  const diffSum = withSpent.reduce((sum, s) => sum + s.differenceKcal!, 0)
  return {
    days: n,
    eaten: { protein: total.protein / n, fat: total.fat / n, carbs: total.carbs / n, kcal: total.kcal / n },
    treat: { protein: treatTotal.protein / n, fat: treatTotal.fat / n, carbs: treatTotal.carbs / n, kcal: treatTotal.kcal / n },
    spentKcal: withSpent.length ? spentSum / withSpent.length : null,
    differenceKcal: withSpent.length ? diffSum / withSpent.length : null,
    totalDifferenceKcal: withSpent.length ? diffSum : null,
  }
}
