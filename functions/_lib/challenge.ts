/**
 * Challenge между выдачей параметров и проверкой ответа.
 *
 * Хранится не в таблице, а в подписанной куке на 5 минут. Таблица тут была бы
 * лишней сущностью: challenge одноразовый и живёт минуты, то есть её пришлось
 * бы ещё и чистить. Подпись тем же SESSION_SECRET гарантирует, что challenge
 * выдали мы, а короткий exp — что его не переиспользуют позже.
 *
 * Кука httpOnly: сам challenge клиенту знать незачем, он приходит внутри
 * options и возвращается браузером в подписанном ответе аутентификатора.
 */
const ALG = { name: 'HMAC', hash: 'SHA-256' } as const

export const CHALLENGE_COOKIE = 'pk_challenge'
const TTL_SECONDS = 5 * 60

type Purpose = 'register' | 'auth'

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

interface ChallengePayload {
  c: string
  p: Purpose
  /** Для регистрации — чей это challenge: чтобы ключ нельзя было привязать к чужому аккаунту. */
  uid?: number
  exp: number
}

export async function signChallenge(
  challenge: string,
  purpose: Purpose,
  secret: string,
  uid?: number,
): Promise<string> {
  const payload: ChallengePayload = {
    c: challenge,
    p: purpose,
    uid,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  }
  const body = b64urlEncode(utf8(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey('raw', utf8(secret), ALG, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign(ALG, key, utf8(body)))
  return `${body}.${b64urlEncode(sig)}`
}

export async function verifyChallenge(
  token: string | null,
  purpose: Purpose,
  secret: string,
): Promise<ChallengePayload | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts as [string, string]

  const key = await crypto.subtle.importKey('raw', utf8(secret), ALG, false, ['sign'])
  const expected = new Uint8Array(await crypto.subtle.sign(ALG, key, utf8(body)))
  if (!timingSafeEqual(expected, b64urlDecode(sig))) return null

  let payload: ChallengePayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
  } catch {
    return null
  }
  if (payload.p !== purpose) return null
  if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null
  return payload
}

export function challengeCookie(token: string): string {
  return `${CHALLENGE_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`
}

/** Challenge одноразовый: гасим сразу после проверки, удачной или нет. */
export function clearChallengeCookie(): string {
  return `${CHALLENGE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}
