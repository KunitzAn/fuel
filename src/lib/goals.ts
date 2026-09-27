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
  /** ⚡ — цель дня выросла от активности (README «Шапка дневника»). */
  changedByActivity: boolean
}

/**
 * Без настроек и активности: цель = база, потрачено = покой (README
 * «Без синхронизации и ручных записей»). Прибавка только положительная —
 * минимумов по макросам нет, activityKcal ниже 0 не бывает (сумма ккал
 * тренировок/активностей), но на всякий случай не даём цели уйти ниже базы.
 */
export function computeDayGoal(settings: GoalInput, activityKcal: number): DayGoal {
  const clampedActivity = Math.max(0, activityKcal)
  const protein = settings.baseProtein + (clampedActivity / 100) * settings.perHundredProtein
  const fat = settings.baseFat + (clampedActivity / 100) * settings.perHundredFat
  const carbs = settings.baseCarbs + (clampedActivity / 100) * settings.perHundredCarbs
  return {
    protein,
    fat,
    carbs,
    kcal: kcalFromMacros(protein, fat, carbs),
    activityKcal: clampedActivity,
    spentKcal: settings.restingKcal + clampedActivity,
    changedByActivity: clampedActivity > 0,
  }
}

export function sumActivityKcal(activities: Pick<Activity, 'kcal'>[]): number {
  return activities.reduce((sum, a) => sum + a.kcal, 0)
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
