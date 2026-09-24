import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { json } from '../_lib/http'

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  return json({ userId: ctx.data.userId, email: ctx.data.email })
}
