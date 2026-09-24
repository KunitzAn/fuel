function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 6 цифр — вводится вручную, поэтому никакого URL, который можно сломать
 * прокси-редиректами почтовых сервисов (см. README, почему не ссылка). */
export function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000
  return String(n).padStart(6, '0')
}

/** То, что реально хранится в login_codes.code_hash. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return b64url(new Uint8Array(digest))
}

export const LOGIN_CODE_TTL_SECONDS = 15 * 60 // 15 минут
export const MAX_VERIFY_ATTEMPTS = 5 // код всего 6 цифр — короткий TTL один перебор не спасёт
