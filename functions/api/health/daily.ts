import { eq, sql } from 'drizzle-orm'
import { dailyActiveEnergy } from '../../../db/schema'
import { authenticateApiToken } from '../../_lib/apiToken'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, readJson } from '../../_lib/http'

// Команда с русской локалью может прислать число строкой с запятой и
// единицами («1 152,136 kcal») — берём первое число из строки.
function parseKcal(v: unknown): number | null | 'invalid' {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : 'invalid'
  const match = String(v).replace(/\s/g, '').replace(',', '.').match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : 'invalid'
}

// «2026-09-27» или «2026-09-27T13:55:00+03:00» — берём дату в начале строки.
function parseDate(v: unknown): string | null {
  const match = typeof v === 'string' ? v.trim().match(/^\d{4}-\d{2}-\d{2}/) : null
  return match ? match[0] : null
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
  // В ответе на ошибку — то, что реально пришло: в Командах иначе не
  // увидеть, во что превратилась переменная (формат даты, единицы и т.п.).
  const fail = (reason: string) => json({ error: reason, received: body }, { status: 400 })
  if (!body) return error(400, 'invalid_body')
  const date = parseDate(body.date)
  if (!date) return fail('invalid_date')
  const activeKcal = parseKcal(body.activeKcal)
  const restingKcal = parseKcal(body.restingKcal)
  if (activeKcal === 'invalid' || restingKcal === 'invalid') return fail('invalid_kcal')
  if (activeKcal === null && restingKcal === null) return fail('nothing_to_save')

  const set: Record<string, unknown> = { updatedAt: sql`now()`, serverUpdatedAt: sql`now()`, deletedAt: null }
  if (activeKcal !== null) set.totalActiveKcal = activeKcal
  if (restingKcal !== null) set.restingKcal = restingKcal

  await db
    .insert(dailyActiveEnergy)
    .values({ userId, date, totalActiveKcal: activeKcal, restingKcal, serverUpdatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: [dailyActiveEnergy.userId, dailyActiveEnergy.date],
      set,
      setWhere: eq(dailyActiveEnergy.userId, userId),
    })

  return json({ ok: true, date, activeKcal, restingKcal })
}
