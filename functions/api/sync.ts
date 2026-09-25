import { and, eq, gt, sql } from 'drizzle-orm'
import { entries, foods, snacks } from '../../db/schema'
import type { AuthedData } from '../_lib/context'
import { getDb, type Db } from '../_lib/db'
import type { Env } from '../_lib/env'
import { error, json, readJson, sameOrigin } from '../_lib/http'

interface WireFood {
  id: string
  kind: 'product' | 'dish'
  name: string
  brand: string | null
  barcode: string | null
  protein: number
  fat: number
  carbs: number
  kcal: number
  note: string | null
  sourceCatalogId: string | null
  lastGrams: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface WireSnack {
  id: string
  date: string
  after: 'breakfast' | 'lunch' | 'dinner'
  name: string
  position: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface WireEntry {
  id: string
  date: string
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  snackId: string | null
  foodId: string | null
  catalogId: string | null
  name: string
  brand: string | null
  protein: number
  fat: number
  carbs: number
  kcal: number
  grams: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// GET /api/sync?since=<ISO8601> — отдаёт всё изменённое после `since`
// (пустой/отсутствующий since — первая синхронизация, отдаём всё).
//
// Фильтр идёт по `server_updated_at` (ставит сервер при каждой записи),
// а не по `updated_at` (ставит клиент со своих часов) — иначе офлайн-правка,
// отправленная позже, чем другое устройство успело синхронизироваться, не
// долетит до него: курсор «после X» сравнивался бы со временем на телефоне,
// которое может быть в прошлом относительно X. См. PLAN.md, этап 1.1.
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  const db = getDb(ctx.env)
  const userId = ctx.data.userId
  const since = new URL(ctx.request.url).searchParams.get('since')
  const sinceDate = since ? new Date(since) : null

  const [foodRows, snackRows, entryRows] = await Promise.all([
    db
      .select()
      .from(foods)
      .where(sinceDate ? and(eq(foods.userId, userId), gt(foods.serverUpdatedAt, sinceDate)) : eq(foods.userId, userId)),
    db
      .select()
      .from(snacks)
      .where(
        sinceDate ? and(eq(snacks.userId, userId), gt(snacks.serverUpdatedAt, sinceDate)) : eq(snacks.userId, userId),
      ),
    db
      .select()
      .from(entries)
      .where(
        sinceDate
          ? and(eq(entries.userId, userId), gt(entries.serverUpdatedAt, sinceDate))
          : eq(entries.userId, userId),
      ),
  ])

  return json({
    serverTime: new Date().toISOString(),
    foods: foodRows.map((f) => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      brand: f.brand,
      barcode: f.barcode,
      protein: f.protein,
      fat: f.fat,
      carbs: f.carbs,
      kcal: f.kcal,
      note: f.note,
      sourceCatalogId: f.sourceCatalogId,
      lastGrams: f.lastGrams,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      deletedAt: f.deletedAt?.toISOString() ?? null,
    })),
    snacks: snackRows.map((s) => ({
      id: s.id,
      date: s.date,
      after: s.after,
      name: s.name,
      position: s.position,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      deletedAt: s.deletedAt?.toISOString() ?? null,
    })),
    entries: entryRows.map((e) => ({
      id: e.id,
      date: e.date,
      meal: e.meal,
      snackId: e.snackId,
      foodId: e.foodId,
      catalogId: e.catalogId,
      name: e.name,
      brand: e.brand,
      protein: e.protein,
      fat: e.fat,
      carbs: e.carbs,
      kcal: e.kcal,
      grams: e.grams,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      deletedAt: e.deletedAt?.toISOString() ?? null,
    })),
  })
}

// POST /api/sync — принимает то, что клиент пометил dirty, и апсертит.
// Last-write-wins по updatedAt (клиентское время — сравнение для конфликта
// правок одной и той же строки, не для курсора синка, см. GET выше).
//
// Порядок foods → snacks → entries важен: у entries есть FK на food_id и
// snack_id, и если офлайн создали продукт/перекус и запись с ним в одной
// сессии, всё это уезжает одним POST — foods/snacks должны попасть в базу
// раньше entries, которые на них ссылаются.
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const db = getDb(ctx.env)
  const userId = ctx.data.userId
  const body = await readJson<{
    foods?: WireFood[]
    snacks?: WireSnack[]
    entries?: WireEntry[]
  }>(ctx.request)
  if (!body) return error(400, 'invalid_body')

  const acceptedFoods = await upsertFoods(db, userId, body.foods ?? [])
  const acceptedSnacks = await upsertSnacks(db, userId, body.snacks ?? [])
  const acceptedEntries = await upsertEntries(db, userId, body.entries ?? [])

  return json({
    serverTime: new Date().toISOString(),
    accepted: { foods: acceptedFoods, snacks: acceptedSnacks, entries: acceptedEntries },
  })
}

/**
 * Один INSERT ... ON CONFLICT ... RETURNING на всю пачку сразу — не select
 * + insert/update на каждую строку (см. README daylens, комментарий у
 * upsertCategories: Cloudflare режет Worker на 50-м сабзапросе, а 2–4
 * запроса на строку упираются в него уже на паре завтраков). `excluded.<col>`
 * — предложенная (INSERT-нутая) версия строки внутри ON CONFLICT DO UPDATE.
 * `server_updated_at` — всегда `now()`, не значение от клиента (см. GET).
 */
async function upsertFoods(db: Db, userId: number, rows: WireFood[]): Promise<string[]> {
  if (rows.length === 0) return []
  const accepted = await db
    .insert(foods)
    .values(
      rows.map((f) => ({
        id: f.id,
        userId,
        kind: f.kind,
        name: f.name,
        brand: f.brand,
        barcode: f.barcode,
        protein: f.protein,
        fat: f.fat,
        carbs: f.carbs,
        kcal: f.kcal,
        note: f.note,
        sourceCatalogId: f.sourceCatalogId,
        lastGrams: f.lastGrams,
        createdAt: new Date(f.createdAt),
        updatedAt: new Date(f.updatedAt),
        serverUpdatedAt: sql`now()`,
        deletedAt: f.deletedAt ? new Date(f.deletedAt) : null,
      })),
    )
    .onConflictDoUpdate({
      target: foods.id,
      set: {
        kind: sql`excluded.kind`,
        name: sql`excluded.name`,
        brand: sql`excluded.brand`,
        barcode: sql`excluded.barcode`,
        protein: sql`excluded.protein`,
        fat: sql`excluded.fat`,
        carbs: sql`excluded.carbs`,
        kcal: sql`excluded.kcal`,
        note: sql`excluded.note`,
        sourceCatalogId: sql`excluded.source_catalog_id`,
        lastGrams: sql`excluded.last_grams`,
        updatedAt: sql`excluded.updated_at`,
        serverUpdatedAt: sql`now()`,
        deletedAt: sql`excluded.deleted_at`,
      },
      setWhere: sql`${foods.userId} = ${userId} and excluded.updated_at > ${foods.updatedAt}`,
    })
    .returning({ id: foods.id })
  return accepted.map((r) => r.id)
}

async function upsertSnacks(db: Db, userId: number, rows: WireSnack[]): Promise<string[]> {
  if (rows.length === 0) return []
  const accepted = await db
    .insert(snacks)
    .values(
      rows.map((s) => ({
        id: s.id,
        userId,
        date: s.date,
        after: s.after,
        name: s.name,
        position: s.position,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        serverUpdatedAt: sql`now()`,
        deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
      })),
    )
    .onConflictDoUpdate({
      target: snacks.id,
      set: {
        date: sql`excluded.date`,
        after: sql`excluded.after`,
        name: sql`excluded.name`,
        position: sql`excluded.position`,
        updatedAt: sql`excluded.updated_at`,
        serverUpdatedAt: sql`now()`,
        deletedAt: sql`excluded.deleted_at`,
      },
      setWhere: sql`${snacks.userId} = ${userId} and excluded.updated_at > ${snacks.updatedAt}`,
    })
    .returning({ id: snacks.id })
  return accepted.map((r) => r.id)
}

async function upsertEntries(db: Db, userId: number, rows: WireEntry[]): Promise<string[]> {
  if (rows.length === 0) return []
  const accepted = await db
    .insert(entries)
    .values(
      rows.map((e) => ({
        id: e.id,
        userId,
        date: e.date,
        meal: e.meal,
        snackId: e.snackId,
        foodId: e.foodId,
        catalogId: e.catalogId,
        name: e.name,
        brand: e.brand,
        protein: e.protein,
        fat: e.fat,
        carbs: e.carbs,
        kcal: e.kcal,
        grams: e.grams,
        createdAt: new Date(e.createdAt),
        updatedAt: new Date(e.updatedAt),
        serverUpdatedAt: sql`now()`,
        deletedAt: e.deletedAt ? new Date(e.deletedAt) : null,
      })),
    )
    .onConflictDoUpdate({
      target: entries.id,
      set: {
        date: sql`excluded.date`,
        meal: sql`excluded.meal`,
        snackId: sql`excluded.snack_id`,
        foodId: sql`excluded.food_id`,
        catalogId: sql`excluded.catalog_id`,
        name: sql`excluded.name`,
        brand: sql`excluded.brand`,
        protein: sql`excluded.protein`,
        fat: sql`excluded.fat`,
        carbs: sql`excluded.carbs`,
        kcal: sql`excluded.kcal`,
        grams: sql`excluded.grams`,
        updatedAt: sql`excluded.updated_at`,
        serverUpdatedAt: sql`now()`,
        deletedAt: sql`excluded.deleted_at`,
      },
      setWhere: sql`${entries.userId} = ${userId} and excluded.updated_at > ${entries.updatedAt}`,
    })
    .returning({ id: entries.id })
  return accepted.map((r) => r.id)
}
