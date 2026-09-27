/**
 * Расчёт цели дня (README «Цели и энергия», плюс этап 4.4 — тип дня, не из
 * README). Единственное место в проекте, где юнит-тесты обязательны
 * (PLAN.md, этап 4.2) — формулы легко тихо сломать, а рефакторить их будем
 * не глядя на экран каждый раз.
 */
import { shiftDate } from './date'
import type { Activity, DayType, Entry, GoalSettings } from './db'
import { kcalFromMacros, scaleByGrams, sumMacros, type Macros } from './nutrition'

export interface GoalInput {
  baseProtein: number
  baseFat: number
  baseCarbs: number
  restingKcal: number
  perHundredProtein: number
  perHundredFat: number
  perHundredCarbs: number
  highDeltaProtein: number
  highDeltaFat: number
  highDeltaCarbs: number
  lowDeltaProtein: number
  lowDeltaFat: number
  lowDeltaCarbs: number
}

export interface DayGoal {
  protein: number
  fat: number
  carbs: number
  kcal: number
  activityKcal: number
  spentKcal: number // энергия покоя + активность
  /** Который из макросов реально выросли от активности — ⚡ у той ячейки в шапке (README). */
  proteinChanged: boolean
  fatChanged: boolean
  carbsChanged: boolean
  /** ⚡ у ккал/общий флаг — вырос хоть один макрос. */
  changedByActivity: boolean
}

/**
 * Без настроек и активности: цель = база, потрачено = покой (README
 * «Без синхронизации и ручных записей»). Прибавка только положительная —
 * минимумов по макросам нет, activityKcal ниже 0 не бывает (сумма ккал
 * тренировок/активностей), но на всякий случай не даём цели уйти ниже базы.
 *
 * `changedByActivity` — не «была ли активность», а «хоть один макрос
 * реально вырос»: при перекосе настроек «на 100 ккал» в 0/0/0 по всем
 * макросам активность есть, а цель не двигается — ⚡ показывать нечего.
 */
export function computeDayGoal(settings: GoalInput, activityKcal: number): DayGoal {
  const clampedActivity = Math.max(0, activityKcal)
  const protein = settings.baseProtein + (clampedActivity / 100) * settings.perHundredProtein
  const fat = settings.baseFat + (clampedActivity / 100) * settings.perHundredFat
  const carbs = settings.baseCarbs + (clampedActivity / 100) * settings.perHundredCarbs
  const proteinChanged = protein > settings.baseProtein
  const fatChanged = fat > settings.baseFat
  const carbsChanged = carbs > settings.baseCarbs
  return {
    protein,
    fat,
    carbs,
    kcal: kcalFromMacros(protein, fat, carbs),
    activityKcal: clampedActivity,
    spentKcal: settings.restingKcal + clampedActivity,
    proteinChanged,
    fatChanged,
    carbsChanged,
    changedByActivity: proteinChanged || fatChanged || carbsChanged,
  }
}

export function sumActivityKcal(activities: Pick<Activity, 'kcal'>[]): number {
  return activities.reduce((sum, a) => sum + a.kcal, 0)
}

/** README: «разница = съедено − потрачено» — минус означает дефицит. */
export function energyDifference(eatenKcal: number, spentKcal: number): number {
  return eatenKcal - spentKcal
}

/**
 * Версия настроек, действующая на дату: максимальный `validFrom ≤ date`;
 * при нескольких правках в один день (тот же validFrom) — более новая по
 * `createdAt` (README «История настроек целей» не описывает правку внутри
 * дня отдельно — так проще всего и не противоречит «действует с сегодня»).
 */
export function pickGoalSettingsForDate<T extends Pick<GoalSettings, 'validFrom' | 'createdAt'>>(
  rows: T[],
  date: string,
): T | null {
  let best: T | null = null
  for (const row of rows) {
    if (row.validFrom > date) continue
    if (
      !best ||
      row.validFrom > best.validFrom ||
      (row.validFrom === best.validFrom && row.createdAt > best.createdAt)
    ) {
      best = row
    }
  }
  return best
}

/**
 * Тип дня (этап 4.4, новая мысль владелицы, не из README): высоко-/
 * низкоуглеводный день, отдельно от целей по активности — поправка
 * складывается с базой параллельно поправке на активность, а не заменяет
 * её. Низкоуглеводный хранится в настройках как положительная «убавка»,
 * здесь превращается в отрицательную поправку.
 */
export type DayTypeKind = 'low' | 'high'

export interface DayTypeDelta {
  protein: number
  fat: number
  carbs: number
}

/** Поправка «вручную» — из текущей версии настроек (та же, что база). */
export function manualDayTypeDelta(kind: DayTypeKind, settings: GoalInput): DayTypeDelta {
  if (kind === 'high') {
    return { protein: settings.highDeltaProtein, fat: settings.highDeltaFat, carbs: settings.highDeltaCarbs }
  }
  return { protein: -settings.lowDeltaProtein, fat: -settings.lowDeltaFat, carbs: -settings.lowDeltaCarbs }
}

/**
 * Поправка «из статистики» — среднее КБЖУ по факту прошлых дней этого же
 * типа минус текущая база: получившееся число складывается с базой точно
 * так же, как и вручную заданная поправка (владелица: «складывается с
 * базовой целью параллельно поправке на активность»). Сегодняшний день (и
 * будущие) в расчёт не берём — у него ещё не может быть факта. Дни без
 * единой записи в `entries` из среднего исключаются (иначе занизили бы
 * его нулём, хотя на самом деле просто не открывала приложение).
 */
export function statsDayTypeDelta(
  kind: DayTypeKind,
  base: Pick<GoalInput, 'baseProtein' | 'baseFat' | 'baseCarbs'>,
  entries: Pick<Entry, 'date' | 'protein' | 'fat' | 'carbs' | 'kcal' | 'grams'>[],
  dayTypeRows: Pick<DayType, 'date' | 'actual'>[],
  periodDays: number | null,
  today: string,
): DayTypeDelta | null {
  const cutoff = periodDays !== null ? shiftDate(today, -periodDays) : null
  const matchingDates = new Set(
    dayTypeRows.filter((d) => d.actual === kind && d.date < today && (!cutoff || d.date >= cutoff)).map((d) => d.date),
  )
  if (matchingDates.size === 0) return null

  const totalsByDate = new Map<string, Macros>()
  for (const e of entries) {
    if (!matchingDates.has(e.date)) continue
    const scaled = scaleByGrams(e, e.grams)
    const prev = totalsByDate.get(e.date)
    totalsByDate.set(e.date, prev ? sumMacros([prev, scaled]) : scaled)
  }
  const days = [...totalsByDate.values()]
  if (days.length === 0) return null

  const avg = sumMacros(days)
  return {
    protein: avg.protein / days.length - base.baseProtein,
    fat: avg.fat / days.length - base.baseFat,
    carbs: avg.carbs / days.length - base.baseCarbs,
  }
}

/** Складывает поправку типа дня с уже посчитанной (активностью) целью — независимые слагаемые. */
export function applyDayTypeDelta(goal: DayGoal, delta: DayTypeDelta | null): DayGoal {
  if (!delta) return goal
  const protein = goal.protein + delta.protein
  const fat = goal.fat + delta.fat
  const carbs = goal.carbs + delta.carbs
  return { ...goal, protein, fat, carbs, kcal: kcalFromMacros(protein, fat, carbs) }
}
