/**
 * Личный токен Команды iOS (этап 5) — тот же подход, что и коды входа
 * (`loginCode.ts`): в БД лежит только хэш, сырой токен виден один раз, в
 * момент выпуска.
 */
import { eq, sql } from 'drizzle-orm'
import { apiTokens } from '../../db/schema'
import type { Db } from './db'

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

/** userId по заголовку `Authorization: Bearer <токен>`, `null` — нет/чужой/отозванный токен. */
export async function authenticateApiToken(db: Db, request: Request): Promise<number | null> {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  if (!token) return null
  const tokenHash = await hashApiToken(token)

  const rows = await db.select({ id: apiTokens.id, userId: apiTokens.userId }).from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).limit(1)
  const row = rows[0]
  if (!row) return null

  await db.update(apiTokens).set({ lastUsedAt: sql`now()` }).where(eq(apiTokens.id, row.id))
  return row.userId
}
