import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { challengeCookie, signChallenge } from '../../_lib/challenge'
import type { Env } from '../../_lib/env'
import { error, json, sameOrigin } from '../../_lib/http'
import { relyingParty } from '../../_lib/webauthn'

// Публичный (под /api/auth/) — его зовут как раз когда сессии ещё нет.
// allowCredentials не передаём намеренно: ключ резидентный, браузер сам
// покажет подходящие. Иначе пришлось бы сначала спрашивать почту — то есть
// ровно то, от чего passkey и избавляет.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const { rpID } = relyingParty(ctx.request)
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
  const token = await signChallenge(options.challenge, 'auth', ctx.env.SESSION_SECRET)

  return json({ options }, { headers: { 'Set-Cookie': challengeCookie(token) } })
}
