import { ref } from 'vue'
import { checkSession, me } from './auth'
import { api } from './api'
import { db, type Entry, type Food, type Snack } from './db'

const LAST_SYNCED_AT_KEY = 'lastSyncedAt'
const SYNCED_USER_ID_KEY = 'syncedUserId'
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
}

interface PushResponse {
  serverTime: string
  accepted: { foods: string[]; snacks: string[]; entries: string[] }
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
  await db.transaction('rw', db.foods, db.snacks, db.entries, db.settings, async () => {
    await db.foods.clear()
    await db.snacks.clear()
    await db.entries.clear()
    await db.settings.delete(LAST_SYNCED_AT_KEY)
  })
}

/**
 * В отличие от daylens, здесь не нужен особый случай «первый синк на
 * устройстве»: там локальный дефолтный сид категорий срабатывал вслепую до
 * входа и требовал полной замены серверными данными, чтобы не раздвоиться.
 * Fuel никого не сеет — пользователь начинает с пустого дневника, поэтому
 * обычный мёрж по `updatedAt` подходит и для первого синка тоже.
 */
async function mergePulled(res: SyncResponse): Promise<void> {
  await db.transaction('rw', db.foods, db.snacks, db.entries, async () => {
    for (const f of res.foods) {
      const local = await db.foods.get(f.id)
      if (!local || new Date(local.updatedAt) < new Date(f.updatedAt)) {
        await db.foods.put({ ...f, dirty: false })
      }
    }
    for (const s of res.snacks) {
      const local = await db.snacks.get(s.id)
      if (!local || new Date(local.updatedAt) < new Date(s.updatedAt)) {
        await db.snacks.put({ ...s, dirty: false })
      }
    }
    for (const e of res.entries) {
      const local = await db.entries.get(e.id)
      if (!local || new Date(local.updatedAt) < new Date(e.updatedAt)) {
        await db.entries.put({ ...e, dirty: false })
      }
    }
  })
}

interface PushChunk {
  foods: Food[]
  snacks: Snack[]
  entries: Entry[]
}

/**
 * Foods/snacks режутся впереди entries по тому же индексу: пока в одном из
 * массивов ещё есть строки на этой позиции, entries из той же пачки могут на
 * них ссылаться (FK) — сервер обрабатывает foods → snacks → entries внутри
 * одного запроса (см. functions/api/sync.ts), так что для обычных объёмов
 * (десятки строк) связанные foods/snacks и entries всегда попадают в один
 * и тот же или более ранний чанк.
 */
function chunkPush(foodsArr: Food[], snacksArr: Snack[], entriesArr: Entry[]): PushChunk[] {
  const max = Math.max(foodsArr.length, snacksArr.length, entriesArr.length)
  if (max === 0) return [{ foods: [], snacks: [], entries: [] }]
  const chunks: PushChunk[] = []
  for (let i = 0; i < max; i += PUSH_CHUNK_SIZE) {
    chunks.push({
      foods: foodsArr.slice(i, i + PUSH_CHUNK_SIZE),
      snacks: snacksArr.slice(i, i + PUSH_CHUNK_SIZE),
      entries: entriesArr.slice(i, i + PUSH_CHUNK_SIZE),
    })
  }
  return chunks
}

async function updatePendingCount(): Promise<void> {
  const [foodsAll, snacksAll, entriesAll] = await Promise.all([
    db.foods.toArray(),
    db.snacks.toArray(),
    db.entries.toArray(),
  ])
  pendingCount.value = [...foodsAll, ...snacksAll, ...entriesAll].filter((r) => r.dirty).length
}

/**
 * Пуляет и подтягивает изменения. Не блокирует запись, если не вышло —
 * это фоновая операция, вызывающий код её не ждёт как условие для UI.
 */
export async function runSync(): Promise<void> {
  if (syncing.value) return
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

    const since = await getLastSyncedAt()
    const pulled = await api.get<SyncResponse>(`/api/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`)
    await mergePulled(pulled)

    const dirtyFoods = (await db.foods.toArray()).filter((f) => f.dirty)
    const dirtySnacks = (await db.snacks.toArray()).filter((s) => s.dirty)
    const dirtyEntries = (await db.entries.toArray()).filter((e) => e.dirty)

    const acceptedFoods = new Set<string>()
    const acceptedSnacks = new Set<string>()
    const acceptedEntries = new Set<string>()
    let latestServerTime = pulled.serverTime

    for (const chunk of chunkPush(dirtyFoods, dirtySnacks, dirtyEntries)) {
      if (!chunk.foods.length && !chunk.snacks.length && !chunk.entries.length) continue
      const pushed = await api.post<PushResponse>('/api/sync', chunk)
      pushed.accepted.foods.forEach((id) => acceptedFoods.add(id))
      pushed.accepted.snacks.forEach((id) => acceptedSnacks.add(id))
      pushed.accepted.entries.forEach((id) => acceptedEntries.add(id))
      latestServerTime = pushed.serverTime
    }

    await db.foods.where('id').anyOf([...acceptedFoods]).modify({ dirty: false })
    await db.snacks.where('id').anyOf([...acceptedSnacks]).modify({ dirty: false })
    await db.entries.where('id').anyOf([...acceptedEntries]).modify({ dirty: false })

    await setLastSyncedAt(latestServerTime)
    await db.settings.put({ key: SYNCED_USER_ID_KEY, value: String(session.userId) })
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
