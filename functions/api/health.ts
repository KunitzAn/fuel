import { json } from '../_lib/http'

export const onRequestGet: PagesFunction = async () => {
  return json({ ok: true })
}
