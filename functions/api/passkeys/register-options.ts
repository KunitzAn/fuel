import { eq } from 'drizzle-orm'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { passkeys } from '../../../db/schema'
import type { AuthedData } from '../../_lib/context'
import { challengeCookie, signChallenge } from '../../_lib/challenge'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, sameOrigin } from '../../_lib/http'
import { relyingParty, RP_NAME } from '../../_lib/webauthn'

// Лежит под /api/passkeys/, а не /api/auth/: всё, кроме /api/auth/*, закрыто
// middleware сессией — а заводить passkey можно только уже войдя, иначе ключ
// можно было бы привязать к чужому аккаунту.
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const { rpID } = relyingParty(ctx.request)
  const db = getDb(ctx.env)
  const userId = ctx.data.userId

  const existing = await db.select().from(passkeys).where(eq(passkeys.userId, userId))

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: ctx.data.email,
    attestationType: 'none',
    // Уже заведённые ключи исключаем: иначе на том же телефоне получится
    // второй ключ того же аккаунта, и список настроек превратится в кашу.
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      transports: p.transports ? (JSON.parse(p.transports) as never) : undefined,
    })),
    authenticatorSelection: {
      // residentKey: вход без предварительного ввода почты — ради этого всё
      // и затевалось. userVerification: Face ID / код-пароль обязателен.
      residentKey: 'required',
      userVerification: 'preferred',
    },
  })

  const token = await signChallenge(options.challenge, 'register', ctx.env.SESSION_SECRET, userId)
  return json({ options }, { headers: { 'Set-Cookie': challengeCookie(token) } })
}
