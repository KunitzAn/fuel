import { and, eq, gte, sql } from 'drizzle-orm'
import { loginCodeRequests, loginCodes, users } from '../../../db/schema'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { sendLoginCodeEmail } from '../../_lib/email'
import { clientIp, error, json, readJson, sameOrigin } from '../../_lib/http'
import { generateCode, hashCode, LOGIN_CODE_TTL_SECONDS } from '../../_lib/loginCode'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// По email — защита от спама конкретному адресу; по IP — от перебора
// разных адресов с одного источника.
const MAX_PER_EMAIL_PER_WINDOW = 3
const MAX_PER_IP_PER_WINDOW = 8
const WINDOW_MINUTES = 15

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const body = await readJson<{ email?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return error(400, 'invalid_email')

  const db = getDb(ctx.env)
  const ip = clientIp(ctx.request)
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000)

  const [emailCount, ipCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginCodeRequests)
      .where(and(eq(loginCodeRequests.email, email), gte(loginCodeRequests.createdAt, windowStart))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginCodeRequests)
      .where(and(eq(loginCodeRequests.ip, ip), gte(loginCodeRequests.createdAt, windowStart))),
  ])

  if (
    (emailCount[0]?.count ?? 0) >= MAX_PER_EMAIL_PER_WINDOW ||
    (ipCount[0]?.count ?? 0) >= MAX_PER_IP_PER_WINDOW
  ) {
    return error(429, 'rate_limited')
  }

  await db.insert(loginCodeRequests).values({ email, ip })

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) {
    ;[user] = await db.insert(users).values({ email }).returning()
  }
  if (!user) return error(500, 'user_upsert_failed')

  const code = generateCode()
  const codeHash = await hashCode(code)
  await db.insert(loginCodes).values({
    userId: user.id,
    codeHash,
    expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_SECONDS * 1000),
  })

  try {
    await sendLoginCodeEmail(ctx.env, email, code)
  } catch (err) {
    console.error('sendLoginCodeEmail failed', err)
    return error(502, 'email_send_failed')
  }

  return json({ ok: true })
}
