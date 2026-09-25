import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as catalogSchema from '../../db/catalogSchema'
import * as schema from '../../db/schema'
import type { Env } from './env'

/**
 * Клиент Drizzle поверх HTTP-драйвера Neon (пользовательские данные,
 * проект `fuel`). На Workers нельзя открывать сырой TCP — только этот драйвер.
 */
export function getDb(env: Env) {
  const sql = neon(env.DATABASE_URL)
  return drizzle(sql, { schema })
}

export type Db = ReturnType<typeof getDb>

/**
 * Отдельный проект Neon (`fuel-catalog`) — общий каталог продуктов, не
 * связан внешними ключами с `fuel` (см. README «БД: два проекта Neon»).
 */
export function getCatalogDb(env: Env) {
  const sql = neon(env.CATALOG_DATABASE_URL)
  return drizzle(sql, { schema: catalogSchema })
}
