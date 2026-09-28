import { eq, sql } from 'drizzle-orm'
import { activities, dailyActiveEnergy } from '../../../db/schema'
import { authenticateApiToken } from '../../_lib/apiToken'
import type { Db } from '../../_lib/db'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, readJson } from '../../_lib/http'

interface WireWorkout {
  externalId: string
  name: string | null
  date: string // локальная дата телефона — присылает Команда, не выводим из startedAt (часовые пояса)
  startedAt: string | null
  durationMin: number | null
  kcal: number // активные калории — как раньше, идут в цель/потрачено
  totalKcal: number | null // этап 5: полные калории (актив + покой) — только для просмотра
}

interface WireDailyActiveEnergy {
  date: string
  totalActiveKcal: number
}

async function upsertWorkouts(db: Db, userId: number, workouts: WireWorkout[]): Promise<{ count: number; kcal: number }> {
  if (workouts.length === 0) return { count: 0, kcal: 0 }

  await db
    .insert(activities)
    .values(
      workouts.map((w) => ({
        id: crypto.randomUUID(),
        userId,
        date: w.date,
        source: 'watch',
        name: w.name,
        kcal: w.kcal,
        totalKcal: w.totalKcal,
        externalId: w.externalId,
        startedAt: w.startedAt ? new Date(w.startedAt) : null,
        durationMin: w.durationMin,
        serverUpdatedAt: sql`now()`,
      })),
    )
    .onConflictDoUpdate({
      target: [activities.userId, activities.externalId],
      set: {
        date: sql`excluded.date`,
        name: sql`excluded.name`,
        kcal: sql`excluded.kcal`,
        totalKcal: sql`excluded.total_kcal`,
        startedAt: sql`excluded.started_at`,
        durationMin: sql`excluded.duration_min`,
        updatedAt: sql`now()`,
        serverUpdatedAt: sql`now()`,
      },
      setWhere: eq(activities.userId, userId),
    })

  return { count: workouts.length, kcal: workouts.reduce((sum, w) => sum + w.kcal, 0) }
}

async function upsertDailyActiveEnergy(db: Db, userId: number, rows: WireDailyActiveEnergy[]): Promise<void> {
  if (rows.length === 0) return

  await db
    .insert(dailyActiveEnergy)
    .values(rows.map((r) => ({ userId, date: r.date, totalActiveKcal: r.totalActiveKcal, serverUpdatedAt: sql`now()` })))
    .onConflictDoUpdate({
      target: [dailyActiveEnergy.userId, dailyActiveEnergy.date],
      set: {
        totalActiveKcal: sql`excluded.total_active_kcal`,
        updatedAt: sql`now()`,
        serverUpdatedAt: sql`now()`,
      },
      setWhere: eq(dailyActiveEnergy.userId, userId),
    })
}

/**
 * Приём тренировок от Команды iOS (этап 5, README «Синхронизация
 * тренировок»). Авторизация своим Bearer-токеном (`api_tokens`), не
 * сессионной курткой — Команда не умеет её хранить. Публичный маршрут в
 * `_middleware.ts` (`/api/health`), проверка токена — здесь.
 */
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = getDb(ctx.env)
  const userId = await authenticateApiToken(db, ctx.request)
  if (!userId) return error(401, 'unauthorized')

  const body = await readJson<{ workouts?: WireWorkout[]; dailyActiveEnergy?: WireDailyActiveEnergy[] }>(ctx.request)
  if (!body) return error(400, 'invalid_body')

  const workouts = await upsertWorkouts(db, userId, body.workouts ?? [])
  await upsertDailyActiveEnergy(db, userId, body.dailyActiveEnergy ?? [])

  return json({ serverTime: new Date().toISOString(), workouts: workouts.count, kcal: Math.round(workouts.kcal) })
}
