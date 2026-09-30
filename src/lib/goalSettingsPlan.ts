/**
 * Сохранение настроек целей «с даты» или «на период» (владелица, после
 * этапа 6; раньше — только с сегодня). Чистая часть без Dexie, чтобы
 * покрыть тестами: что удалить, что вставить.
 *
 * Модель та же — версии по `validFrom` (goals.ts → pickGoalSettingsForDate).
 * Чтобы новые цифры действовали на всём выбранном отрезке, версии,
 * начинающиеся внутри него, убираем (мягко) — иначе более поздняя
 * перебила бы новую. Для периода с концом после него возвращаем ту
 * версию, что действовала там раньше (или «без настроек», если не было).
 */
import { shiftDate } from './date'
import type { GoalSettings } from './db'
import { pickGoalSettingsForDate, type GoalInput } from './goals'

export interface GoalSettingsRange {
  from: string
  /** Включительно; `null` — и дальше, без конца. */
  to: string | null
}

export type NewGoalSettingsRow = GoalInput & { validFrom: string }

export interface GoalSettingsSavePlan {
  deleteIds: string[]
  inserts: NewGoalSettingsRow[]
}

const EMPTY: GoalInput = {
  baseProtein: null,
  baseFat: null,
  baseCarbs: null,
  restingKcal: null,
  perHundredProtein: null,
  perHundredFat: null,
  perHundredCarbs: null,
  highDeltaProtein: null,
  highDeltaFat: null,
  highDeltaCarbs: null,
  lowDeltaProtein: null,
  lowDeltaFat: null,
  lowDeltaCarbs: null,
  minKcal: null,
  maxKcal: null,
  minProtein: null,
  maxProtein: null,
  minFat: null,
  maxFat: null,
  minCarbs: null,
  maxCarbs: null,
  maxFollowsActivity: false,
}

function toInput(row: GoalSettings): GoalInput {
  const out = { ...EMPTY }
  for (const key of Object.keys(EMPTY) as (keyof GoalInput)[]) {
    const v = row[key]
    // Старая локальная строка без новых полей — undefined → как «не задано»
    ;(out as Record<string, unknown>)[key] = v === undefined ? EMPTY[key] : v
  }
  return out
}

export function planGoalSettingsSave(rows: GoalSettings[], draft: GoalInput, range: GoalSettingsRange): GoalSettingsSavePlan {
  const live = rows.filter((r) => r.deletedAt === null)
  const after = range.to ? shiftDate(range.to, 1) : null
  // Что действовало сразу после периода — до правки
  const restore = after ? pickGoalSettingsForDate(live, after) : null

  const inside = (d: string) => d >= range.from && (range.to === null || d <= range.to)
  const deleteIds = live.filter((r) => inside(r.validFrom)).map((r) => r.id)

  const inserts: NewGoalSettingsRow[] = [{ ...draft, validFrom: range.from }]
  if (after && !live.some((r) => r.validFrom === after)) {
    inserts.push({ ...(restore ? toInput(restore) : EMPTY), validFrom: after })
  }
  return { deleteIds, inserts }
}

/** Даты начала версий, которые сохранение заменит — подсказка в форме. */
export function replacedVersionDates(rows: GoalSettings[], range: GoalSettingsRange): string[] {
  return rows
    .filter((r) => r.deletedAt === null && r.validFrom >= range.from && (range.to === null || r.validFrom <= range.to))
    .map((r) => r.validFrom)
    .sort()
}
