import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { activities, dailyActiveEnergy, dayTypes, entries, foods, goalSettings, snacks } from '../../db/schema'
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

interface WireActivity {
  id: string
  date: string
  source: 'watch' | 'manual'
  name: string | null
  kcal: number
  totalKcal: number | null
  externalId: string | null
  startedAt: string | null
  durationMin: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface WireGoalSettings {
  id: string
  validFrom: string
  baseProtein: number
  baseFat: number
  baseCarbs: number
  restingKcal: number
  perHundredProtein: number
  perHundredFat: number
  perHundredCarbs: number
  highDeltaProtein: number
  highDeltaFat: number
  highDeltaCarbs: number
  lowDeltaProtein: number
  lowDeltaFat: number
  lowDeltaCarbs: number
  minKcal: number | null
  maxKcal: number | null
  minProtein: number | null
  maxProtein: number | null
  minFat: number | null
  maxFat: number | null
  minCarbs: number | null
  maxCarbs: number | null
  maxFollowsActivity?: boolean // нет у старых клиентов — считаем false
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface WireDayType {
  date: string
  planned: 'low' | 'high' | null
  plannedSource: 'manual' | 'stats' | null
  plannedDeltaProtein: number | null
  plannedDeltaFat: number | null
  plannedDeltaCarbs: number | null
  actual: 'low' | 'high' | null
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
  treat?: boolean // нет у старых клиентов — false
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

  const [foodRows, snackRows, entryRows, activityRows, goalSettingsRows, dayTypeRows, dailyActiveEnergyRows] = await Promise.all([
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
    db
      .select()
      .from(activities)
      .where(
        sinceDate
          ? and(eq(activities.userId, userId), gt(activities.serverUpdatedAt, sinceDate))
          : eq(activities.userId, userId),
      ),
    db
      .select()
      .from(goalSettings)
      .where(
        sinceDate
          ? and(eq(goalSettings.userId, userId), gt(goalSettings.serverUpdatedAt, sinceDate))
          : eq(goalSettings.userId, userId),
      ),
    db
      .select()
      .from(dayTypes)
      .where(
        sinceDate
          ? and(eq(dayTypes.userId, userId), gt(dayTypes.serverUpdatedAt, sinceDate))
          : eq(dayTypes.userId, userId),
      ),
    db
      .select()
      .from(dailyActiveEnergy)
      .where(
        sinceDate
          ? and(eq(dailyActiveEnergy.userId, userId), gt(dailyActiveEnergy.serverUpdatedAt, sinceDate))
          : eq(dailyActiveEnergy.userId, userId),
      ),
  ])

  return json({
    serverTime: new Date().toISOString(),
    foods: foodRows.map(wireFood),
    snacks: snackRows.map(wireSnack),
    entries: entryRows.map(wireEntry),
    activities: activityRows.map(wireActivity),
    goalSettings: goalSettingsRows.map(wireGoalSettings),
    dayTypes: dayTypeRows.map(wireDayType),
    // Этап 5, не из README до реализации: read-only с клиента, пишет
    // только /api/health/workouts (Bearer-токен Команды) — своего push
    // для этой таблицы здесь, в POST-хендлере ниже, нет и не будет.
    dailyActiveEnergy: dailyActiveEnergyRows.map((r) => ({
      date: r.date,
      totalActiveKcal: r.totalActiveKcal,
      restingKcal: r.restingKcal,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
    })),
  })
}

// Строки в том же виде, что отдаёт GET — ими же POST отвечает на
// отклонённые правки (см. `current` ниже).
function wireFood(f: typeof foods.$inferSelect) {
  return {
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
  }
}

function wireSnack(s: typeof snacks.$inferSelect) {
  return {
    id: s.id,
    date: s.date,
    after: s.after,
    name: s.name,
    position: s.position,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    deletedAt: s.deletedAt?.toISOString() ?? null,
  }
}

function wireEntry(e: typeof entries.$inferSelect) {
  return {
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
    treat: e.treat,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    deletedAt: e.deletedAt?.toISOString() ?? null,
  }
}

function wireActivity(a: typeof activities.$inferSelect) {
  return {
    id: a.id,
    date: a.date,
    source: a.source,
    name: a.name,
    kcal: a.kcal,
    totalKcal: a.totalKcal,
    externalId: a.externalId,
    startedAt: a.startedAt?.toISOString() ?? null,
    durationMin: a.durationMin,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt?.toISOString() ?? null,
  }
}

function wireGoalSettings(g: typeof goalSettings.$inferSelect) {
  return {
    id: g.id,
    validFrom: g.validFrom,
    baseProtein: g.baseProtein,
    baseFat: g.baseFat,
    baseCarbs: g.baseCarbs,
    restingKcal: g.restingKcal,
    perHundredProtein: g.perHundredProtein,
    perHundredFat: g.perHundredFat,
    perHundredCarbs: g.perHundredCarbs,
    highDeltaProtein: g.highDeltaProtein,
    highDeltaFat: g.highDeltaFat,
    highDeltaCarbs: g.highDeltaCarbs,
    lowDeltaProtein: g.lowDeltaProtein,
    lowDeltaFat: g.lowDeltaFat,
    lowDeltaCarbs: g.lowDeltaCarbs,
    minKcal: g.minKcal,
    maxKcal: g.maxKcal,
    minProtein: g.minProtein,
    maxProtein: g.maxProtein,
    minFat: g.minFat,
    maxFat: g.maxFat,
    minCarbs: g.minCarbs,
    maxCarbs: g.maxCarbs,
    maxFollowsActivity: g.maxFollowsActivity,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    deletedAt: g.deletedAt?.toISOString() ?? null,
  }
}

function wireDayType(d: typeof dayTypes.$inferSelect) {
  return {
    date: d.date,
    planned: d.planned,
    plannedSource: d.plannedSource,
    plannedDeltaProtein: d.plannedDeltaProtein,
    plannedDeltaFat: d.plannedDeltaFat,
    plannedDeltaCarbs: d.plannedDeltaCarbs,
    actual: d.actual,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    deletedAt: d.deletedAt?.toISOString() ?? null,
  }
}

// POST /api/sync — принимает то, что клиент пометил dirty, и апсертит.
// Last-write-wins по updatedAt (клиентское время — сравнение для конфликта
// правок одной и той же строки, не для курсора синка, см. GET выше).
//
// Порядок foods → snacks → entries важен: у entries есть FK на food_id и
// snack_id, и если офлайн создали продукт/перекус и запись с ним в одной
// сессии, всё это уезжает одним POST — foods/snacks должны попасть в базу
// раньше entries, которые на них ссылаются.
/**
 * Падение POST раньше уходило голым 500 без текста — у владелицы синк
 * висел с «Ждут отправки», а причину не видно ни ей, ни в логах (wrangler
 * tail недоступен). Теперь текст ошибки базы (например, какое ограничение
 * нарушено) возвращается клиенту и виден в Настройках → «подробнее».
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  try {
    return await handlePost(ctx)
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : null
    const message = cause ?? (err instanceof Error ? err.message : String(err))
    console.error('sync POST failed', err)
    return error(500, `sync_failed: ${message.slice(0, 400)}`)
  }
}

const handlePost: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  if (!sameOrigin(ctx.request, ctx.env.APP_URL)) return error(403, 'forbidden')

  const db = getDb(ctx.env)
  const userId = ctx.data.userId
  const body = await readJson<{
    foods?: WireFood[]
    snacks?: WireSnack[]
    entries?: WireEntry[]
    activities?: WireActivity[]
    goalSettings?: WireGoalSettings[]
    dayTypes?: WireDayType[]
  }>(ctx.request)
  if (!body) return error(400, 'invalid_body')

  const acceptedFoods = await upsertFoods(db, userId, body.foods ?? [])
  const acceptedSnacks = await upsertSnacks(db, userId, body.snacks ?? [])
  const acceptedEntries = await upsertEntries(db, userId, body.entries ?? [])
  const acceptedActivities = await upsertActivities(db, userId, body.activities ?? [])
  const acceptedGoalSettings = await upsertGoalSettings(db, userId, body.goalSettings ?? [])
  const acceptedDayTypes = await upsertDayTypes(db, userId, body.dayTypes ?? [])

  // Отклонённые правки (на сервере версия новее — LWW) отдаём сразу
  // целиком: иначе клиент так и держал бы их «ждущими отправки» вечно —
  // курсор pull уже ушёл дальше, и свежую серверную версию он бы не
  // получил никогда (поймали: «Ждут отправки: 23» у владелицы).
  const rejectedIds = (sent: { id: string }[], accepted: string[]) => {
    const ok = new Set(accepted)
    return sent.map((r) => r.id).filter((id) => !ok.has(id))
  }
  const rejFoods = rejectedIds(body.foods ?? [], acceptedFoods)
  const rejSnacks = rejectedIds(body.snacks ?? [], acceptedSnacks)
  const rejEntries = rejectedIds(body.entries ?? [], acceptedEntries)
  const rejActivities = rejectedIds(body.activities ?? [], acceptedActivities)
  const rejGoalSettings = rejectedIds(body.goalSettings ?? [], acceptedGoalSettings)
  const acceptedDates = new Set(acceptedDayTypes)
  const rejDayTypes = (body.dayTypes ?? []).map((d) => d.date).filter((d) => !acceptedDates.has(d))
  const [curFoods, curSnacks, curEntries, curActivities, curGoalSettings, curDayTypes] = await Promise.all([
    rejFoods.length ? db.select().from(foods).where(and(eq(foods.userId, userId), inArray(foods.id, rejFoods))) : [],
    rejSnacks.length ? db.select().from(snacks).where(and(eq(snacks.userId, userId), inArray(snacks.id, rejSnacks))) : [],
    rejEntries.length ? db.select().from(entries).where(and(eq(entries.userId, userId), inArray(entries.id, rejEntries))) : [],
    rejActivities.length
      ? db.select().from(activities).where(and(eq(activities.userId, userId), inArray(activities.id, rejActivities)))
      : [],
    rejGoalSettings.length
      ? db.select().from(goalSettings).where(and(eq(goalSettings.userId, userId), inArray(goalSettings.id, rejGoalSettings)))
      : [],
    rejDayTypes.length
      ? db.select().from(dayTypes).where(and(eq(dayTypes.userId, userId), inArray(dayTypes.date, rejDayTypes)))
      : [],
  ])

  return json({
    serverTime: new Date().toISOString(),
    accepted: {
      foods: acceptedFoods,
      snacks: acceptedSnacks,
      entries: acceptedEntries,
      activities: acceptedActivities,
      goalSettings: acceptedGoalSettings,
      dayTypes: acceptedDayTypes,
    },
    current: {
      foods: curFoods.map(wireFood),
      snacks: curSnacks.map(wireSnack),
      entries: curEntries.map(wireEntry),
      activities: curActivities.map(wireActivity),
      goalSettings: curGoalSettings.map(wireGoalSettings),
      dayTypes: curDayTypes.map(wireDayType),
    },
  })
}

/**
 * Один INSERT ... ON CONFLICT ... RETURNING на всю пачку сразу — не select
 * + insert/update на каждую строку (см. README daylens, комментарий у
 * upsertCategories: Cloudflare режет Worker на 50-м сабзапросе, а 2–4
 * запроса на строку упираются в него уже на паре завтраков). `excluded.<col>`
 * — предложенная (INSERT-нутая) версия строки внутри ON CONFLICT DO UPDATE.
 * `server_updated_at` — всегда `now()`, не значение от клиента (см. GET).
 *
 * `setWhere: excluded.updated_at >= <col>`, не строго `>` — иначе повторная
 * отправка уже принятой (но с тем же updatedAt) строки после потерянного
 * ответа сети навсегда застревала бы в чужой копии как dirty: WHERE не
 * срабатывал (не строго больше), UPDATE молча не выполнялся, `.returning()`
 * её не возвращал, id не попадал в accepted — клиент так и не узнавал, что
 * сервер её на самом деле уже принял, и «Ждут отправки» не обнулялось.
 * Совпадающий updatedAt от ДРУГОГО устройства (не ретрай) — статистически
 * невозможен, так что `>=` ничего не портит.
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
      setWhere: sql`${foods.userId} = ${userId} and excluded.updated_at >= ${foods.updatedAt}`,
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
      setWhere: sql`${snacks.userId} = ${userId} and excluded.updated_at >= ${snacks.updatedAt}`,
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
        treat: e.treat ?? false,
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
        treat: sql`excluded.treat`,
        updatedAt: sql`excluded.updated_at`,
        serverUpdatedAt: sql`now()`,
        deletedAt: sql`excluded.deleted_at`,
      },
      setWhere: sql`${entries.userId} = ${userId} and excluded.updated_at >= ${entries.updatedAt}`,
    })
    .returning({ id: entries.id })
  return accepted.map((r) => r.id)
}

async function upsertActivities(db: Db, userId: number, rows: WireActivity[]): Promise<string[]> {
  if (rows.length === 0) return []
  const accepted = await db
    .insert(activities)
    .values(
      rows.map((a) => ({
        id: a.id,
        userId,
        date: a.date,
        source: a.source,
        name: a.name,
        kcal: a.kcal,
        totalKcal: a.totalKcal,
        externalId: a.externalId,
        startedAt: a.startedAt ? new Date(a.startedAt) : null,
        durationMin: a.durationMin,
        createdAt: new Date(a.createdAt),
        updatedAt: new Date(a.updatedAt),
        serverUpdatedAt: sql`now()`,
        deletedAt: a.deletedAt ? new Date(a.deletedAt) : null,
      })),
    )
    .onConflictDoUpdate({
      target: activities.id,
      set: {
        date: sql`excluded.date`,
        source: sql`excluded.source`,
        name: sql`excluded.name`,
        kcal: sql`excluded.kcal`,
        totalKcal: sql`excluded.total_kcal`,
        externalId: sql`excluded.external_id`,
        startedAt: sql`excluded.started_at`,
        durationMin: sql`excluded.duration_min`,
        updatedAt: sql`excluded.updated_at`,
        serverUpdatedAt: sql`now()`,
        deletedAt: sql`excluded.deleted_at`,
      },
      setWhere: sql`${activities.userId} = ${userId} and excluded.updated_at >= ${activities.updatedAt}`,
    })
    .returning({ id: activities.id })
  return accepted.map((r) => r.id)
}

async function upsertGoalSettings(db: Db, userId: number, rows: WireGoalSettings[]): Promise<string[]> {
  if (rows.length === 0) return []
  const accepted = await db
    .insert(goalSettings)
    .values(
      rows.map((g) => ({
        id: g.id,
        userId,
        validFrom: g.validFrom,
        baseProtein: g.baseProtein,
        baseFat: g.baseFat,
        baseCarbs: g.baseCarbs,
        restingKcal: g.restingKcal,
        perHundredProtein: g.perHundredProtein,
        perHundredFat: g.perHundredFat,
        perHundredCarbs: g.perHundredCarbs,
        highDeltaProtein: g.highDeltaProtein,
        highDeltaFat: g.highDeltaFat,
        highDeltaCarbs: g.highDeltaCarbs,
        lowDeltaProtein: g.lowDeltaProtein,
        lowDeltaFat: g.lowDeltaFat,
        lowDeltaCarbs: g.lowDeltaCarbs,
        minKcal: g.minKcal,
        maxKcal: g.maxKcal,
        minProtein: g.minProtein,
        maxProtein: g.maxProtein,
        minFat: g.minFat,
        maxFat: g.maxFat,
        minCarbs: g.minCarbs,
        maxCarbs: g.maxCarbs,
        maxFollowsActivity: g.maxFollowsActivity ?? false,
        createdAt: new Date(g.createdAt),
        updatedAt: new Date(g.updatedAt),
        serverUpdatedAt: sql`now()`,
        deletedAt: g.deletedAt ? new Date(g.deletedAt) : null,
      })),
    )
    .onConflictDoUpdate({
      target: goalSettings.id,
      set: {
        validFrom: sql`excluded.valid_from`,
        baseProtein: sql`excluded.base_protein`,
        baseFat: sql`excluded.base_fat`,
        baseCarbs: sql`excluded.base_carbs`,
        restingKcal: sql`excluded.resting_kcal`,
        perHundredProtein: sql`excluded.per_hundred_protein`,
        perHundredFat: sql`excluded.per_hundred_fat`,
        perHundredCarbs: sql`excluded.per_hundred_carbs`,
        highDeltaProtein: sql`excluded.high_delta_protein`,
        highDeltaFat: sql`excluded.high_delta_fat`,
        highDeltaCarbs: sql`excluded.high_delta_carbs`,
        lowDeltaProtein: sql`excluded.low_delta_protein`,
        lowDeltaFat: sql`excluded.low_delta_fat`,
        lowDeltaCarbs: sql`excluded.low_delta_carbs`,
        minKcal: sql`excluded.min_kcal`,
        maxKcal: sql`excluded.max_kcal`,
        minProtein: sql`excluded.min_protein`,
        maxProtein: sql`excluded.max_protein`,
        minFat: sql`excluded.min_fat`,
        maxFat: sql`excluded.max_fat`,
        minCarbs: sql`excluded.min_carbs`,
        maxCarbs: sql`excluded.max_carbs`,
        maxFollowsActivity: sql`excluded.max_follows_activity`,
        updatedAt: sql`excluded.updated_at`,
        serverUpdatedAt: sql`now()`,
        deletedAt: sql`excluded.deleted_at`,
      },
      setWhere: sql`${goalSettings.userId} = ${userId} and excluded.updated_at >= ${goalSettings.updatedAt}`,
    })
    .returning({ id: goalSettings.id })
  return accepted.map((r) => r.id)
}

/**
 * В отличие от прочих upsert-функций — конфликт по (`userId`, `date`), а не
 * по синтетическому `id`: у day_types его нет, сама дата и есть первичный
 * ключ (db/schema.ts), поэтому два устройства без координации всегда метят
 * один и тот же ключ строки для одного и того же дня.
 */
async function upsertDayTypes(db: Db, userId: number, rows: WireDayType[]): Promise<string[]> {
  if (rows.length === 0) return []
  const accepted = await db
    .insert(dayTypes)
    .values(
      rows.map((d) => ({
        userId,
        date: d.date,
        planned: d.planned,
        plannedSource: d.plannedSource,
        plannedDeltaProtein: d.plannedDeltaProtein,
        plannedDeltaFat: d.plannedDeltaFat,
        plannedDeltaCarbs: d.plannedDeltaCarbs,
        actual: d.actual,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
        serverUpdatedAt: sql`now()`,
        deletedAt: d.deletedAt ? new Date(d.deletedAt) : null,
      })),
    )
    .onConflictDoUpdate({
      target: [dayTypes.userId, dayTypes.date],
      set: {
        planned: sql`excluded.planned`,
        plannedSource: sql`excluded.planned_source`,
        plannedDeltaProtein: sql`excluded.planned_delta_protein`,
        plannedDeltaFat: sql`excluded.planned_delta_fat`,
        plannedDeltaCarbs: sql`excluded.planned_delta_carbs`,
        actual: sql`excluded.actual`,
        updatedAt: sql`excluded.updated_at`,
        serverUpdatedAt: sql`now()`,
        deletedAt: sql`excluded.deleted_at`,
      },
      setWhere: sql`${dayTypes.userId} = ${userId} and excluded.updated_at >= ${dayTypes.updatedAt}`,
    })
    .returning({ date: dayTypes.date })
  return accepted.map((r) => r.date)
}
