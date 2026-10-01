/**
 * Правка типа дня — план с утра и факт в конце дня, независимо друг от
 * друга (этап 4.4, не из README). Один тип на календарный день — правится
 * на месте (не версионируется, в отличие от goal_settings), поэтому
 * update-in-place по дате, а не всегда-новая-строка.
 */
import { db, type DayType } from './db'
import type { DayTypeDelta, DayTypeKind } from './goals'
import { runSync } from './sync'

async function upsertDayType(date: string, patch: Partial<Omit<DayType, 'date' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty'>>): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.dayTypes.get(date)
  if (existing && existing.deletedAt === null) {
    await db.dayTypes.update(date, { ...patch, updatedAt: now, dirty: true })
    return
  }
  // Строка на эту дату была удалена (мягко) — новая отметка её «оживляет»
  // со сброшенными старыми значениями. Раньше правка писалась в удалённую
  // строку и оставалась невидимой: владелица не могла отметить факт за
  // 27.09, хотя 28.09 отмечался (там строки не было вовсе).
  if (existing) {
    await db.dayTypes.update(date, {
      planned: null,
      plannedSource: null,
      plannedDeltaProtein: null,
      plannedDeltaFat: null,
      plannedDeltaCarbs: null,
      actual: null,
      ...patch,
      updatedAt: now,
      deletedAt: null,
      dirty: true,
    })
    return
  }
  await db.dayTypes.add({
    date,
    planned: null,
    plannedSource: null,
    plannedDeltaProtein: null,
    plannedDeltaFat: null,
    plannedDeltaCarbs: null,
    actual: null,
    ...patch,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  })
}

export interface DayTypePlan {
  kind: DayTypeKind
  source: 'manual' | 'stats'
  delta: DayTypeDelta
}

/** null — снять план, вернуть день к обычному. */
export async function setPlannedDayType(date: string, plan: DayTypePlan | null): Promise<void> {
  if (!plan) {
    await upsertDayType(date, { planned: null, plannedSource: null, plannedDeltaProtein: null, plannedDeltaFat: null, plannedDeltaCarbs: null })
  } else {
    await upsertDayType(date, {
      planned: plan.kind,
      plannedSource: plan.source,
      plannedDeltaProtein: plan.delta.protein,
      plannedDeltaFat: plan.delta.fat,
      plannedDeltaCarbs: plan.delta.carbs,
    })
  }
  void runSync()
}

/** null — снять отметку факта. */
export async function setActualDayType(date: string, actual: DayTypeKind | null): Promise<void> {
  await upsertDayType(date, { actual })
  void runSync()
}
