import { ref } from 'vue'
import { checkSession, me } from './auth'
import { api } from './api'
import { db, type Activity, type DailyActiveEnergy, type DayType, type Entry, type Food, type GoalSettings, type Snack } from './db'

const LAST_SYNCED_AT_KEY = 'lastSyncedAt'
const SYNCED_USER_ID_KEY = 'syncedUserId'
const SYNC_SCHEMA_KEY = 'syncSchema'
/**
 * Поднимать при каждом новом синкаемом поле или таблице. Старая версия
 * приложения выбрасывает незнакомое из ответа сервера, но курсор `since`
 * всё равно двигает — и новая версия потом никогда не получит строки,
 * пришедшие до её установки. Так на телефоне владелицы мин/макс границы
 * пришли как `undefined` (строка настроек закешировалась до миграции).
 * Смена номера = один полный pull с заменой всех строк, которые локально
 * не правились (`dirty: false`).
 */
const SYNC_SCHEMA = 2
// Сервер апсертит одним запросом на таблицу — в лимит Cloudflare по
// сабзапросам (см. functions/api/sync.ts) больше не упираемся. Резать на
// части всё равно стоит: одна VALUES-пачка в тысячи строк (многодневный
// офлайн-марафон) — это и большое тело запроса, и долгая транзакция.
const PUSH_CHUNK_SIZE = 300

export const syncing = ref(false)
export const lastSyncError = ref<string | null>(null)
export const pendingCount = ref(0)

interface SyncResponse {
  serverTime: string
  foods: Omit<Food, 'dirty'>[]
  snacks: Omit<Snack, 'dirty'>[]
  entries: Omit<Entry, 'dirty'>[]
  activities: Omit<Activity, 'dirty'>[]
  goalSettings: Omit<GoalSettings, 'dirty'>[]
  dayTypes: Omit<DayType, 'dirty'>[]
  // Этап 5, не из README до реализации: read-only с клиента, пишет только
  // `/api/health/workouts` — своего push для этой таблицы нет.
  dailyActiveEnergy: Omit<DailyActiveEnergy, 'dirty'>[]
}

interface PushResponse {
  serverTime: string
  accepted: {
    foods: string[]
    snacks: string[]
    entries: string[]
    activities: string[]
    goalSettings: string[]
    dayTypes: string[]
  }
}

async function getLastSyncedAt(): Promise<string | null> {
  const row = await db.settings.get(LAST_SYNCED_AT_KEY)
  return row?.value ?? null
}

async function setLastSyncedAt(value: string): Promise<void> {
  await db.settings.put({ key: LAST_SYNCED_AT_KEY, value })
}

async function getSyncedUserId(): Promise<number | null> {
  const row = await db.settings.get(SYNCED_USER_ID_KEY)
  return row ? Number(row.value) : null
}

/**
 * На устройстве сменился аккаунт. Дневник прежнего владельца стираем:
 * держать его локально — это и чужие записи в истории, и сломанный курсор
 * (`since` от прошлого аккаунта заставляет сервер отдавать только то, что
 * новее чужой синхронизации, то есть почти ничего).
 */
async function resetLocalDiary(): Promise<void> {
  await db.transaction(
    'rw',
    [db.foods, db.snacks, db.entries, db.activities, db.goalSettings, db.dayTypes, db.dailyActiveEnergy, db.settings],
    async () => {
      await db.foods.clear()
      await db.snacks.clear()
      await db.entries.clear()
      await db.activities.clear()
      await db.goalSettings.clear()
      await db.dayTypes.clear()
      await db.dailyActiveEnergy.clear()
      await db.settings.delete(LAST_SYNCED_AT_KEY)
    },
  )
}

/**
 * В отличие от daylens, здесь не нужен особый случай «первый синк на
 * устройстве»: там локальный дефолтный сид категорий срабатывал вслепую до
 * входа и требовал полной замены серверными данными, чтобы не раздвоиться.
 * Fuel никого не сеет — пользователь начинает с пустого дневника, поэтому
 * обычный мёрж по `updatedAt` подходит и для первого синка тоже.
 */
/**
 * Обычно берём серверную строку, только если она новее локальной. При
 * полном обновлении — ещё и равную по времени, если локально её не
 * правили: у неё те же данные, но в локальной копии может не хватать
 * полей, добавленных позже.
 */
function shouldTake(local: { updatedAt: string; dirty: boolean } | undefined, remote: { updatedAt: string }, fullRefresh: boolean): boolean {
  if (!local) return true
  const localTime = new Date(local.updatedAt).getTime()
  const remoteTime = new Date(remote.updatedAt).getTime()
  if (localTime < remoteTime) return true
  return fullRefresh && !local.dirty && localTime === remoteTime
}

async function mergePulled(res: SyncResponse, fullRefresh: boolean): Promise<void> {
  await db.transaction('rw', [db.foods, db.snacks, db.entries, db.activities, db.goalSettings, db.dayTypes, db.dailyActiveEnergy], async () => {
    for (const f of res.foods) {
      const local = await db.foods.get(f.id)
      if (shouldTake(local, f, fullRefresh)) {
        await db.foods.put({ ...f, dirty: false })
      }
    }
    for (const s of res.snacks) {
      const local = await db.snacks.get(s.id)
      if (shouldTake(local, s, fullRefresh)) {
        await db.snacks.put({ ...s, dirty: false })
      }
    }
    for (const e of res.entries) {
      const local = await db.entries.get(e.id)
      if (shouldTake(local, e, fullRefresh)) {
        await db.entries.put({ ...e, dirty: false })
      }
    }
    for (const a of res.activities) {
      const local = await db.activities.get(a.id)
      if (shouldTake(local, a, fullRefresh)) {
        await db.activities.put({ ...a, dirty: false })
      }
    }
    for (const g of res.goalSettings) {
      const local = await db.goalSettings.get(g.id)
      if (shouldTake(local, g, fullRefresh)) {
        await db.goalSettings.put({ ...g, dirty: false })
      }
    }
    for (const d of res.dayTypes) {
      const local = await db.dayTypes.get(d.date)
      if (shouldTake(local, d, fullRefresh)) {
        await db.dayTypes.put({ ...d, dirty: false })
      }
    }
    for (const r of res.dailyActiveEnergy) {
      const local = await db.dailyActiveEnergy.get(r.date)
      if (shouldTake(local, r, fullRefresh)) {
        await db.dailyActiveEnergy.put({ ...r, dirty: false })
      }
    }
  })
}

interface PushChunk {
  foods: Food[]
  snacks: Snack[]
  entries: Entry[]
  activities: Activity[]
  goalSettings: GoalSettings[]
  dayTypes: DayType[]
}

/**
 * Foods/snacks режутся впереди entries по тому же индексу: пока в одном из
 * массивов ещё есть строки на этой позиции, entries из той же пачки могут на
 * них ссылаться (FK) — сервер обрабатывает foods → snacks → entries внутри
 * одного запроса (см. functions/api/sync.ts), так что для обычных объёмов
 * (десятки строк) связанные foods/snacks и entries всегда попадают в один
 * и тот же или более ранний чанк. Activities/goalSettings/dayTypes ни на
 * что не ссылаются — режутся тем же индексом просто для единообразия.
 */
function chunkPush(
  foodsArr: Food[],
  snacksArr: Snack[],
  entriesArr: Entry[],
  activitiesArr: Activity[],
  goalSettingsArr: GoalSettings[],
  dayTypesArr: DayType[],
): PushChunk[] {
  const max = Math.max(
    foodsArr.length,
    snacksArr.length,
    entriesArr.length,
    activitiesArr.length,
    goalSettingsArr.length,
    dayTypesArr.length,
  )
  if (max === 0) return [{ foods: [], snacks: [], entries: [], activities: [], goalSettings: [], dayTypes: [] }]
  const chunks: PushChunk[] = []
  for (let i = 0; i < max; i += PUSH_CHUNK_SIZE) {
    chunks.push({
      foods: foodsArr.slice(i, i + PUSH_CHUNK_SIZE),
      snacks: snacksArr.slice(i, i + PUSH_CHUNK_SIZE),
      entries: entriesArr.slice(i, i + PUSH_CHUNK_SIZE),
      activities: activitiesArr.slice(i, i + PUSH_CHUNK_SIZE),
      goalSettings: goalSettingsArr.slice(i, i + PUSH_CHUNK_SIZE),
      dayTypes: dayTypesArr.slice(i, i + PUSH_CHUNK_SIZE),
    })
  }
  return chunks
}

async function updatePendingCount(): Promise<void> {
  // dailyActiveEnergy не в счёт: read-only с клиента, dirty у неё не бывает.
  const [foodsAll, snacksAll, entriesAll, activitiesAll, goalSettingsAll, dayTypesAll] = await Promise.all([
    db.foods.toArray(),
    db.snacks.toArray(),
    db.entries.toArray(),
    db.activities.toArray(),
    db.goalSettings.toArray(),
    db.dayTypes.toArray(),
  ])
  pendingCount.value = [...foodsAll, ...snacksAll, ...entriesAll, ...activitiesAll, ...goalSettingsAll, ...dayTypesAll].filter(
    (r) => r.dirty,
  ).length
}

/**
 * Пуляет и подтягивает изменения. Не блокирует запись, если не вышло —
 * это фоновая операция, вызывающий код её не ждёт как условие для UI.
 *
 * Вызовов `runSync()` в приложении много (main.ts при старте, каждая
 * правка дневника, вход, триггеры online/visibilitychange) и они часто
 * накладываются друг на друга — например, старт приложения (main.ts) и
 * `onMounted` экрана настроек. Раньше повторный вызов, заставший уже
 * идущий синк, просто выходил по гварду `if (syncing.value) return` — то
 * есть возвращал промис, который резолвится СРАЗУ, а не когда реальный
 * синк на самом деле закончится. `SettingsView` ждала именно этот промис,
 * чтобы открыть «Сохранить» после первой подтяжки настроек — из-за этого
 * форма считала себя готовой раньше, чем данные реально долетели до
 * Dexie, и сохранение могло затереть уже настроенное. Поймала это на
 * тесте 4.5: сохранила только мин/макс границы на чистом браузере — цель
 * (100/20/140, 1140 ккал) реально обнулилась в Neon, хотя кнопка
 * «Сохранить» была разблокирована. Чиню: конкурентные вызовы дожидаются
 * ТОГО ЖЕ промиса, что и уже идущий синк, а не резолвятся вникуда.
 */
let inFlight: Promise<void> | null = null

export function runSync(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = runSyncOnce().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSyncOnce(): Promise<void> {
  syncing.value = true
  lastSyncError.value = null

  try {
    const session = me.value ?? (await checkSession())
    if (!session) return // не вошли — синк просто не выполняется, это ок

    const previousUserId = await getSyncedUserId()
    const switchedAccount = previousUserId !== null && previousUserId !== session.userId
    if (switchedAccount) await resetLocalDiary()

    // Курсор есть, а владельца мы не записывали — устройство синхронизировалось
    // версией до появления syncedUserId, или это самый первый синк вообще.
    // Сбрасываем курсор на всякий случай: локальные записи не трогаем — среди
    // них могут быть неотправленные, и терять их нельзя.
    if (!switchedAccount && previousUserId === null && (await getLastSyncedAt()) !== null) {
      await db.settings.delete(LAST_SYNCED_AT_KEY)
    }

    const fullRefresh = (await db.settings.get(SYNC_SCHEMA_KEY))?.value !== String(SYNC_SCHEMA)
    if (fullRefresh) await db.settings.delete(LAST_SYNCED_AT_KEY)

    const since = await getLastSyncedAt()
    const pulled = await api.get<SyncResponse>(`/api/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`)
    await mergePulled(pulled, fullRefresh)

    const dirtyFoods = (await db.foods.toArray()).filter((f) => f.dirty)
    const dirtySnacks = (await db.snacks.toArray()).filter((s) => s.dirty)
    const dirtyEntries = (await db.entries.toArray()).filter((e) => e.dirty)
    const dirtyActivities = (await db.activities.toArray()).filter((a) => a.dirty)
    const dirtyGoalSettings = (await db.goalSettings.toArray()).filter((g) => g.dirty)
    const dirtyDayTypes = (await db.dayTypes.toArray()).filter((d) => d.dirty)

    const acceptedFoods = new Set<string>()
    const acceptedSnacks = new Set<string>()
    const acceptedEntries = new Set<string>()
    const acceptedActivities = new Set<string>()
    const acceptedGoalSettings = new Set<string>()
    const acceptedDayTypes = new Set<string>()
    let latestServerTime = pulled.serverTime

    for (const chunk of chunkPush(dirtyFoods, dirtySnacks, dirtyEntries, dirtyActivities, dirtyGoalSettings, dirtyDayTypes)) {
      if (
        !chunk.foods.length &&
        !chunk.snacks.length &&
        !chunk.entries.length &&
        !chunk.activities.length &&
        !chunk.goalSettings.length &&
        !chunk.dayTypes.length
      )
        continue
      const pushed = await api.post<PushResponse>('/api/sync', chunk)
      pushed.accepted.foods.forEach((id) => acceptedFoods.add(id))
      pushed.accepted.snacks.forEach((id) => acceptedSnacks.add(id))
      pushed.accepted.entries.forEach((id) => acceptedEntries.add(id))
      pushed.accepted.activities.forEach((id) => acceptedActivities.add(id))
      pushed.accepted.goalSettings.forEach((id) => acceptedGoalSettings.add(id))
      pushed.accepted.dayTypes.forEach((date) => acceptedDayTypes.add(date))
      latestServerTime = pushed.serverTime
    }

    await db.foods.where('id').anyOf([...acceptedFoods]).modify({ dirty: false })
    await db.snacks.where('id').anyOf([...acceptedSnacks]).modify({ dirty: false })
    await db.entries.where('id').anyOf([...acceptedEntries]).modify({ dirty: false })
    await db.activities.where('id').anyOf([...acceptedActivities]).modify({ dirty: false })
    await db.goalSettings.where('id').anyOf([...acceptedGoalSettings]).modify({ dirty: false })
    await db.dayTypes.where('date').anyOf([...acceptedDayTypes]).modify({ dirty: false })

    await setLastSyncedAt(latestServerTime)
    await db.settings.put({ key: SYNCED_USER_ID_KEY, value: String(session.userId) })
    await db.settings.put({ key: SYNC_SCHEMA_KEY, value: String(SYNC_SCHEMA) })
  } catch (err) {
    lastSyncError.value = err instanceof Error ? err.message : 'sync_failed'
  } finally {
    await updatePendingCount()
    syncing.value = false
  }
}

let triggersInstalled = false

/** Триггеры ретрая: online, visibilitychange — обязательный путь синка на
 * iOS Safari, там нет Background Sync API. */
export function installSyncTriggers(): void {
  if (triggersInstalled) return
  triggersInstalled = true

  void updatePendingCount()

  window.addEventListener('online', () => void runSync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSync()
  })
}
