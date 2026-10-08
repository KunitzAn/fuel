import { eq } from 'drizzle-orm'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { passkeys, users } from '../../../db/schema'
import { CHALLENGE_COOKIE, clearChallengeCookie, verifyChallenge } from '../../_lib/challenge'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, readJson, sameOrigin } from '../../_lib/http'
import { readCookie, sessionCookie, signSession } from '../../_lib/session'
import { decodePublicKey, relyingParty } from '../../_lib/webauthn'

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const body = await readJson<{ response?: { id?: string } }>(ctx.request)
  const credentialId = body?.response?.id
  if (!body?.response || !credentialId) return error(400, 'invalid_body')

  const stored = await verifyChallenge(
    readCookie(ctx.request, CHALLENGE_COOKIE),
    'auth',
    ctx.env.SESSION_SECRET,
  )
  if (!stored) return error(400, 'challenge_expired', clearChallengeCookie())

  const db = getDb(ctx.env)
  const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, credentialId)).limit(1)
  // Кто владелец ключа, решает наша таблица, а не клиент: id пришёл из тела
  // запроса, но подпись ниже проверяется ровно тем публичным ключом, который
  // лежит у нас для этого id. Подделать id без приватного ключа бесполезно.
  if (!passkey) return error(400, 'unknown_passkey', clearChallengeCookie())

  const { rpID, origin } = relyingParty(ctx.request)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response as never,
      expectedChallenge: stored.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: decodePublicKey(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports ? (JSON.parse(passkey.transports) as never) : undefined,
      },
    })
  } catch {
    return error(400, 'verification_failed', clearChallengeCookie())
  }

  if (!verification.verified) return error(400, 'verification_failed', clearChallengeCookie())

  const [user] = await db.select().from(users).where(eq(users.id, passkey.userId)).limit(1)
  if (!user) return error(400, 'unknown_passkey', clearChallengeCookie())

  await db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeys.id, passkey.id))

  const token = await signSession({ uid: user.id, email: user.email }, ctx.env.SESSION_SECRET)
  return json(
    { userId: user.id, email: user.email },
    { headers: [['Set-Cookie', sessionCookie(token)], ['Set-Cookie', clearChallengeCookie()]] },
  )
}
