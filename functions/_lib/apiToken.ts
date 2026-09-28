/**
 * Личный токен Команды iOS (этап 5) — тот же подход, что и коды входа
 * (`loginCode.ts`): в БД лежит только хэш, сырой токен виден один раз, в
 * момент выпуска.
 */
function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 32 случайных байта — не 6 цифр кода входа: этот токен живёт долго и не вводится вручную, только вставляется в Команду один раз. */
export function generateApiToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashApiToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return b64url(new Uint8Array(digest))
}
