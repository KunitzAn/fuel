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

/**
 * Ручная активность и (этап 5) тренировки с Apple Watch — README «Цели и
 * энергия». `kcal` — активные калории тренировки, участвуют в цели, как и
 * раньше. `totalKcal` (этап 5, не из README до реализации) — полные
 * калории тренировки (актив + расход покоя за то же время), только для
 * просмотра, в расчёт не входит; у ручных активностей всегда `null`.
 */
export interface Activity {
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
  dirty: boolean
}

/**
 * Версия настроек целей, действует с `validFrom` (README «История настроек
 * целей»). Все числовые поля необязательные: без базы (Б/Ж/У/покоя) цель на
 * день просто не показывается — только факт. `high/lowDelta*` — поправка
 * для типа дня (этап 4.4, не из README) — та же версия, что и база; чтобы
 * этот тип дня был доступен на выбор, нужны все три его поля разом
 * (src/lib/goals.ts → isDayTypeDeltaConfigured). `min/max*` — мин/макс
 * границы нутриентов (этап 4.5, не из README) — своя фича, не выводится
 * из базы, одна пара границ на все дни (без разбивки по типу дня), каждая
 * из восьми независима от остальных (src/lib/goals.ts → configuredBounds).
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
  minKcal: number | null
  maxKcal: number | null
  minProtein: number | null
  maxProtein: number | null
  minFat: number | null
  maxFat: number | null
  minCarbs: number | null
  maxCarbs: number | null
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

/**
 * Вся активная энергия за день целиком (этап 5, не из README до
 * реализации) — read-only с клиента, пишет только `/api/health/workouts`.
 * Ключ — дата, без синтетического id, как `DayType`.
 */
export interface DailyActiveEnergy {
  date: string
  totalActiveKcal: number
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
  dailyActiveEnergy: EntityTable<DailyActiveEnergy, 'date'>
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

db.version(4).stores({
  dailyActiveEnergy: 'date, dirty, deletedAt',
})
