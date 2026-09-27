/**
 * Расчёт цели дня (README «Цели и энергия»). Единственное место в проекте,
 * где юнит-тесты обязательны (PLAN.md, этап 4.2) — формулы легко тихо
 * сломать, а рефакторить их будем не глядя на экран каждый раз.
 */
import { kcalFromMacros } from './nutrition'
import type { Activity, GoalSettings } from './db'

export interface GoalInput {
  baseProtein: number
  baseFat: number
  baseCarbs: number
  restingKcal: number
  perHundredProtein: number
  perHundredFat: number
  perHundredCarbs: number
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
