import { eq } from 'drizzle-orm'
import { apiTokens } from '../../db/schema'
import { generateApiToken, hashApiToken } from '../_lib/apiToken'
import type { AuthedData } from '../_lib/context'
import { getDb } from '../_lib/db'
import type { Env } from '../_lib/env'
import { json, sameOrigin } from '../_lib/http'

/** Статус — есть ли уже выпущенный токен, без самого значения (хэш не разворачивается назад). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  const db = getDb(ctx.env)
  const rows = await db.select({ createdAt: apiTokens.createdAt }).from(apiTokens).where(eq(apiTokens.userId, ctx.data.userId)).limit(1)
  return json({ exists: rows.length > 0, createdAt: rows[0]?.createdAt.toISOString() ?? null })
}

/**
 * Выпускает новый токен, удаляя прежний (один активный токен на
 * пользователя — «выпустить новый» и есть отзыв старого). Сырой токен
 * возвращается только здесь, в БД остаётся только хэш.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return json({ error: 'forbidden' }, { status: 403 })

  const db = getDb(ctx.env)
  const token = generateApiToken()
  const tokenHash = await hashApiToken(token)

  await db.delete(apiTokens).where(eq(apiTokens.userId, ctx.data.userId))
  const [row] = await db.insert(apiTokens).values({ userId: ctx.data.userId, tokenHash }).returning({ createdAt: apiTokens.createdAt })

  return json({ token, createdAt: row!.createdAt.toISOString() })
}
