/**
 * «То, что можно добавить в дневник» — общий вид для трёх источников:
 * мой продукт/блюдо (`foods`), продукт общего каталога (`fuel-catalog`,
 * своей строки в `foods` у него нет) и строка Истории (прошлая запись).
 * Окно граммов, быстрый ＋ и массовый выбор работают с ним, не зная, откуда
 * он пришёл; запись в дневнике получит либо `foodId`, либо `catalogId`.
 */
import type { Entry, Food } from './db'

export interface CatalogItem {
  id: string // 'basic:…' | 'off:…'
  barcode: string | null
  name: string
  brand: string | null
  protein: number
  fat: number
  carbs: number
  kcal: number
  source: 'basic' | 'off'
}

export interface PickItem {
  /** Уникален на экране: один продукт — одна строка, одна отметка в выборе. */
  key: string
  foodId: string | null
  catalogId: string | null
  name: string
  brand: string | null
  /** Переносится в «мою версию» — сканер (этап 3) сначала ищет штрихкод среди своих. */
  barcode: string | null
  protein: number // на 100 г
  fat: number
  carbs: number
  kcal: number
  /** Подстановка в окно граммов; впервые — 100 г (README). */
  lastGrams: number | null
  /** Свой продукт — его можно править (карандаш в окне граммов). */
  food: Food | null
}

export const pickKeyForFood = (id: string) => `food:${id}`
export const pickKeyForCatalog = (id: string) => `catalog:${id}`

export function pickFromFood(food: Food): PickItem {
  return {
    key: pickKeyForFood(food.id),
    foodId: food.id,
    catalogId: null,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    protein: food.protein,
    fat: food.fat,
    carbs: food.carbs,
    kcal: food.kcal,
    lastGrams: food.lastGrams,
    food,
  }
}

/** lastGrams у продукта каталога негде хранить — берём из последней записи с ним. */
export function pickFromCatalog(item: CatalogItem, lastGrams: number | null): PickItem {
  return {
    key: pickKeyForCatalog(item.id),
    foodId: null,
    catalogId: item.id,
    name: item.name,
    brand: item.brand,
    barcode: item.barcode,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
    kcal: item.kcal,
    lastGrams,
    food: null,
  }
}

/**
 * Строка Истории. Свой продукт жив — берём актуальный (с его lastGrams и
 * возможностью править). Удалён или это продукт каталога — берём снимок из
 * самой записи: добавить его снова можно, прошлые граммы — из неё же.
 */
export function pickFromEntry(entry: Entry, foodsById: Map<string, Food>): PickItem | null {
  const food = entry.foodId ? foodsById.get(entry.foodId) : undefined
  if (food) return pickFromFood(food)
  if (!entry.foodId && !entry.catalogId) return null
  return {
    key: entry.foodId ? pickKeyForFood(entry.foodId) : pickKeyForCatalog(entry.catalogId!),
    foodId: entry.foodId,
    catalogId: entry.catalogId,
    name: entry.name,
    brand: entry.brand,
    barcode: null,
    protein: entry.protein,
    fat: entry.fat,
    carbs: entry.carbs,
    kcal: entry.kcal,
    lastGrams: entry.grams,
    food: null,
  }
}
