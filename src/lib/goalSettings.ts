/**
 * Правка настроек целей — всегда новая версия, не update существующей
 * строки (README «История настроек целей»: прошлые дни остаются со своими
 * цифрами). Действует с сегодняшнего дня; какая версия видна конкретному
 * дню — src/lib/goals.ts → pickGoalSettingsForDate.
 */
import { todayLocalDate } from './date'
import { db } from './db'
import { runSync } from './sync'
import type { GoalInput } from './goals'

export async function saveGoalSettings(draft: GoalInput): Promise<void> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.goalSettings.add({
    id,
    validFrom: todayLocalDate(),
    ...draft,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  })
  void runSync()
}
