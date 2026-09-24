import { desc, eq } from 'drizzle-orm'
import { loginCodes, users } from '../../../db/schema'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, readJson, sameOrigin } from '../../_lib/http'
import { hashCode, MAX_VERIFY_ATTEMPTS } from '../../_lib/loginCode'
import { sessionCookie, signSession } from '../../_lib/session'

// POST, не GET: код вводится руками в форму, а не кликается по ссылке —
// сюда никогда не попадёт сканер почтового сервиса или антивирус.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const body = await readJson<{ email?: string; code?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  const code = body?.code?.trim()
  if (!email || !code) return error(400, 'invalid_code')

  const db = getDb(ctx.env)

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return error(400, 'invalid_code') // не палим, что юзера нет

  const [latest] = await db
    .select()
    .from(loginCodes)
    .where(eq(loginCodes.userId, user.id))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1)

  if (!latest || latest.usedAt || latest.expiresAt < new Date() || latest.attempts >= MAX_VERIFY_ATTEMPTS) {
    return error(400, 'invalid_code')
  }

  const submittedHash = await hashCode(code)
  if (submittedHash !== latest.codeHash) {
    await db
      .update(loginCodes)
      .set({ attempts: latest.attempts + 1 })
      .where(eq(loginCodes.id, latest.id))
    return error(400, 'invalid_code')
  }

  await db.update(loginCodes).set({ usedAt: new Date() }).where(eq(loginCodes.id, latest.id))

  const sessionToken = await signSession({ uid: user.id, email: user.email }, ctx.env.SESSION_SECRET)

  return json(
    { userId: user.id, email: user.email },
    { headers: { 'Set-Cookie': sessionCookie(sessionToken) } },
  )
}
