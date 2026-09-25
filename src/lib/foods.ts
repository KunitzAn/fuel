/** Мутации продуктов/блюд — та же логика, что в diary.ts, но для `foods`. */
import { db, type Food } from './db'
import { kcalFromMacros, macrosExceed100, parseDecimal, perServingToPer100 } from './nutrition'
import { runSync } from './sync'

export interface FoodDraft {
  kind: 'product' | 'dish'
  name: string
  brand: string | null
  barcode: string | null
  protein: number
  fat: number
  carbs: number
  kcal: number
  note: string | null
}

export async function createFood(draft: FoodDraft): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.foods.add({
    id,
    ...draft,
    sourceCatalogId: null,
    lastGrams: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  })
  void runSync()
  return id
}

export async function updateFood(id: string, draft: FoodDraft): Promise<void> {
  const now = new Date().toISOString()
  await db.foods.update(id, { ...draft, updatedAt: now, dirty: true })
  void runSync()
}

export async function softDeleteFood(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.foods.update(id, { deletedAt: now, updatedAt: now, dirty: true })
  void runSync()
}

/** Граммы с прошлого раза — подстановка в окно ввода при следующем добавлении. */
export async function rememberLastGrams(foodId: string, grams: number): Promise<void> {
  await db.foods.update(foodId, { lastGrams: grams, dirty: true })
  void runSync()
}

/**
 * «на 100 г» (raw как есть) или «на порцию __ г» (пересчёт на 100) —
 * форма продукта/блюда работает с обоими режимами вводом, но хранит
 * всегда на 100 г.
 */
export function macrosPer100FromForm(
  mode: 'per100' | 'perServing',
  servingGrams: number,
  protein: number,
  fat: number,
  carbs: number,
): { protein: number; fat: number; carbs: number } {
  if (mode === 'per100' || servingGrams <= 0) return { protein, fat, carbs }
  return {
    protein: perServingToPer100(protein, servingGrams),
    fat: perServingToPer100(fat, servingGrams),
    carbs: perServingToPer100(carbs, servingGrams),
  }
}

export { kcalFromMacros, macrosExceed100, parseDecimal }
export type { Food }
