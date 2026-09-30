/**
 * Правка настроек целей — всегда новая версия, не update существующей
 * строки (README «История настроек целей»). Действует с выбранной даты
 * (по умолчанию — с сегодня) или на период; что именно удалить и вставить
 * — goalSettingsPlan.ts. Какая версия видна конкретному дню — goals.ts →
 * pickGoalSettingsForDate.
 */
import { todayLocalDate } from './date'
import { db } from './db'
import type { GoalInput } from './goals'
import { planGoalSettingsSave, type GoalSettingsRange } from './goalSettingsPlan'
import { runSync } from './sync'

export async function saveGoalSettings(
  draft: GoalInput,
  range: GoalSettingsRange = { from: todayLocalDate(), to: null },
): Promise<void> {
  await db.transaction('rw', db.goalSettings, async () => {
    const rows = await db.goalSettings.toArray()
    const plan = planGoalSettingsSave(rows, draft, range)
    const now = Date.now()
    const stamp = new Date(now).toISOString()
    if (plan.deleteIds.length) {
      await db.goalSettings.where('id').anyOf(plan.deleteIds).modify({ deletedAt: stamp, updatedAt: stamp, dirty: true })
    }
    // createdAt по возрастанию — при одинаковом validFrom побеждает более новая
    for (const [i, row] of plan.inserts.entries()) {
      const t = new Date(now + i).toISOString()
      await db.goalSettings.add({ id: crypto.randomUUID(), ...row, createdAt: t, updatedAt: t, deletedAt: null, dirty: true })
    }
  })
  void runSync()
}
