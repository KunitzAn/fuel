import type { Env } from '../../_lib/env'
import { json, sameOrigin } from '../../_lib/http'
import { clearSessionCookie } from '../../_lib/session'

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } })
}
