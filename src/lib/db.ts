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

export const db = new Dexie('fuel') as Dexie & {
  foods: EntityTable<Food, 'id'>
  snacks: EntityTable<Snack, 'id'>
  entries: EntityTable<Entry, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  foods: 'id, kind, name, dirty, deletedAt',
  snacks: 'id, date, dirty, deletedAt',
  // date — не уникален (в дне много записей), foodId/snackId — под окно
  // граммов («подставить прошлые граммы этого продукта») и раскрытие перекуса
  entries: 'id, date, foodId, snackId, dirty, deletedAt',
  settings: 'key',
})
