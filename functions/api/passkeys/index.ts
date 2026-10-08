import { and, eq } from 'drizzle-orm'
import { passkeys } from '../../../db/schema'
import type { AuthedData } from '../../_lib/context'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, readJson, sameOrigin } from '../../_lib/http'

/** Список ключей — чтобы в настройках было видно, что вход по Face ID включён. */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  const db = getDb(ctx.env)
  const rows = await db.select().from(passkeys).where(eq(passkeys.userId, ctx.data.userId))
  return json({
    passkeys: rows.map((p) => ({
      id: p.id,
      label: p.label,
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
    })),
  })
}

/**
 * Удаление ключа. Жёсткое, а не мягкое — в отличие от дневниковых таблиц:
 * passkey не синхронизируется между устройствами нашим протоколом, оживлять
 * его нечему, а «отозванный, но оставшийся в базе» ключ — это дыра, а не
 * сохранность данных.
 */
export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return error(400, 'invalid_body')

  const db = getDb(ctx.env)
  // Условие по userId обязательно: без него можно было бы удалить чужой ключ,
  // зная только его id.
  await db.delete(passkeys).where(and(eq(passkeys.id, body.id), eq(passkeys.userId, ctx.data.userId)))
  return json({ ok: true })
}
