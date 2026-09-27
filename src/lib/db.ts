import Dexie, { type EntityTable } from 'dexie'

export interface Food {
  id: string
  kind: 'product' | 'dish'
  name: string
  brand: string | null
  barcode: string | null
  protein: number // на 100 г
  fat: number
  carbs: number
  kcal: number
  note: string | null // рецепт-заметка блюда, в расчётах не участвует
  sourceCatalogId: string | null // если это «моя версия» продукта из базы
  lastGrams: number | null // подстановка в окно граммов
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  dirty: boolean // не синхронизировано с сервером
}

export interface Snack {
  id: string
  date: string // YYYY-MM-DD
  after: 'breakfast' | 'lunch' | 'dinner'
  name: string
  position: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  dirty: boolean
}

export interface Entry {
  id: string
  date: string
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  snackId: string | null
  foodId: string | null
  catalogId: string | null
  name: string // снимок
  brand: string | null
  protein: number // снимок на 100 г
  fat: number
  carbs: number
  kcal: number
  grams: number
  createdAt: string // порядок в дне и в «Истории»
  updatedAt: string
  deletedAt: string | null
  dirty: boolean
}

export interface Setting {
  key: string
  value: string
}

/** Ручная активность и (этап 5) тренировки с Apple Watch — README «Цели и энергия». */
export interface Activity {
  id: string
  date: string
  source: 'watch' | 'manual'
  name: string | null
  kcal: number
  externalId: string | null
  startedAt: string | null
  durationMin: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  dirty: boolean
}

/**
 * Версия настроек целей, действует с `validFrom` (README «История настроек
 * целей»). Все числовые поля необязательные: без базы (Б/Ж/У/покоя) цель на
 * день просто не показывается — только факт. `high/lowDelta*` — поправка
 * для типа дня (этап 4.4, не из README) — та же версия, что и база; чтобы
 * этот тип дня был доступен на выбор, нужны все три его поля разом
 * (src/lib/goals.ts → isDayTypeDeltaConfigured).
 */
export interface GoalSettings {
  id: string
  validFrom: string // YYYY-MM-DD
  baseProtein: number | null
  baseFat: number | null
  baseCarbs: number | null
  restingKcal: number | null
  perHundredProtein: number | null
  perHundredFat: number | null
  perHundredCarbs: number | null
  highDeltaProtein: number | null
  highDeltaFat: number | null
  highDeltaCarbs: number | null
  lowDeltaProtein: number | null
  lowDeltaFat: number | null
  lowDeltaCarbs: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  dirty: boolean
}

/**
 * Тип дня — план с утра, факт в конце (этап 4.4). Ключ — сама дата, не
 * синтетический id: один тип на календарный день, правится на месте (см.
 * db/schema.ts). `plannedDelta*` — снимок поправки на момент простановки
 * плана, не пересчитывается потом (src/lib/goals.ts).
 */
export interface DayType {
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
  dirty: boolean
}

export const db = new Dexie('fuel') as Dexie & {
  foods: EntityTable<Food, 'id'>
  snacks: EntityTable<Snack, 'id'>
  entries: EntityTable<Entry, 'id'>
  settings: EntityTable<Setting, 'key'>
  activities: EntityTable<Activity, 'id'>
  goalSettings: EntityTable<GoalSettings, 'id'>
  dayTypes: EntityTable<DayType, 'date'>
}

db.version(1).stores({
  foods: 'id, kind, name, dirty, deletedAt',
  snacks: 'id, date, dirty, deletedAt',
  // date — не уникален (в дне много записей), foodId/snackId — под окно
  // граммов («подставить прошлые граммы этого продукта») и раскрытие перекуса
  entries: 'id, date, foodId, snackId, dirty, deletedAt',
  settings: 'key',
})

db.version(2).stores({
  activities: 'id, date, dirty, deletedAt',
  // validFrom — не уникален: возможны две версии за один день (несколько
  // правок), выбор нужной — src/lib/goals.ts, не индекс
  goalSettings: 'id, validFrom, dirty, deletedAt',
})

db.version(3).stores({
  dayTypes: 'date, dirty, deletedAt',
})
