import { eq, sql } from 'drizzle-orm'
import { dailyActiveEnergy } from '../../../db/schema'
import { authenticateApiToken } from '../../_lib/apiToken'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, readJson } from '../../_lib/http'

// Команда с русской локалью может прислать число строкой с запятой («1152,136»).
function parseKcal(v: unknown): number | null | 'invalid' {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : 'invalid'
}

/**
 * Энергия за день от Команды iOS (этап 5.2). В Командах нельзя прочитать
 * отдельные тренировки — только числа из Здоровья, сгруппированные по
 * дням. Поэтому тело плоское, один запрос на один день:
 * `{ date: "2026-09-28", activeKcal?: 1152.1, restingKcal?: 1480 }`.
 * Активную и покой можно слать отдельными запросами — каждый обновляет
 * только своё поле. Повторная отправка того же дня просто перезаписывает
 * число. Авторизация — Bearer-токен, как у /api/health/workouts.
 */
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = getDb(ctx.env)
  const userId = await authenticateApiToken(db, ctx.request)
  if (!userId) return error(401, 'unauthorized')

  const body = await readJson<{ date?: unknown; activeKcal?: unknown; restingKcal?: unknown }>(ctx.request)
  if (!body || typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return error(400, 'invalid_date')
  }
  const activeKcal = parseKcal(body.activeKcal)
  const restingKcal = parseKcal(body.restingKcal)
  if (activeKcal === 'invalid' || restingKcal === 'invalid') return error(400, 'invalid_kcal')
  if (activeKcal === null && restingKcal === null) return error(400, 'nothing_to_save')

  const set: Record<string, unknown> = { updatedAt: sql`now()`, serverUpdatedAt: sql`now()`, deletedAt: null }
  if (activeKcal !== null) set.totalActiveKcal = activeKcal
  if (restingKcal !== null) set.restingKcal = restingKcal

  await db
    .insert(dailyActiveEnergy)
    .values({ userId, date: body.date, totalActiveKcal: activeKcal, restingKcal, serverUpdatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: [dailyActiveEnergy.userId, dailyActiveEnergy.date],
      set,
      setWhere: eq(dailyActiveEnergy.userId, userId),
    })

  return json({ ok: true, date: body.date, activeKcal, restingKcal })
}
