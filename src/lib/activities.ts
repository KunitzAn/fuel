/** Ручная активность (README «Цели и энергия») — Watch-тренировки (этап 5) сюда же, но `source: 'watch'` пока не пишем. */
import { db } from './db'
import { runSync } from './sync'

export interface ActivityDraft {
  name: string | null
  kcal: number
}

export async function addActivity(date: string, draft: ActivityDraft): Promise<void> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.activities.add({
    id,
    date,
    source: 'manual',
    name: draft.name,
    kcal: draft.kcal,
    totalKcal: null,
    externalId: null,
    startedAt: null,
    durationMin: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  })
  void runSync()
}

export async function updateActivity(id: string, draft: ActivityDraft): Promise<void> {
  const now = new Date().toISOString()
  await db.activities.update(id, { name: draft.name, kcal: draft.kcal, updatedAt: now, dirty: true })
  void runSync()
}

export async function softDeleteActivity(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.activities.update(id, { deletedAt: now, updatedAt: now, dirty: true })
  void runSync()
}
