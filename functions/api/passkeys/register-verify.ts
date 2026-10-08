import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { passkeys } from '../../../db/schema'
import type { AuthedData } from '../../_lib/context'
import {
  CHALLENGE_COOKIE,
  clearChallengeCookie,
  verifyChallenge,
} from '../../_lib/challenge'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, readJson, sameOrigin } from '../../_lib/http'
import { readCookie } from '../../_lib/session'
import { deviceLabel, encodePublicKey, relyingParty } from '../../_lib/webauthn'

export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const body = await readJson<{ response?: unknown }>(ctx.request)
  if (!body?.response) return error(400, 'invalid_body')

  const stored = await verifyChallenge(
    readCookie(ctx.request, CHALLENGE_COOKIE),
    'register',
    ctx.env.SESSION_SECRET,
  )
  // Challenge обязан принадлежать тому же пользователю, который сейчас в
  // сессии: иначе чужой ключ можно было бы дописать себе в аккаунт.
  if (!stored || stored.uid !== ctx.data.userId) {
    return error(400, 'challenge_expired', clearChallengeCookie())
  }

  const { rpID, origin } = relyingParty(ctx.request)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as never,
      expectedChallenge: stored.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  } catch {
    return error(400, 'verification_failed', clearChallengeCookie())
  }

  const credential = verification.registrationInfo?.credential
  if (!verification.verified || !credential) {
    return error(400, 'verification_failed', clearChallengeCookie())
  }

  const db = getDb(ctx.env)
  await db
    .insert(passkeys)
    .values({
      id: credential.id,
      userId: ctx.data.userId,
      publicKey: encodePublicKey(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      label: deviceLabel(ctx.request),
    })
    // Тот же ключ заводят повторно (переустановили приложение, ключ в iCloud
    // остался) — не падаем, обновляем. Чужой ключ сюда не попадёт: id приходит
    // из проверенной подписи, а не из тела запроса.
    .onConflictDoUpdate({
      target: passkeys.id,
      set: { userId: ctx.data.userId, publicKey: encodePublicKey(credential.publicKey) },
    })

  return json({ ok: true }, { headers: { 'Set-Cookie': clearChallengeCookie() } })
}
