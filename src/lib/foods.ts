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

/** sourceCatalogId — «моя версия» продукта из базы (этап 2.6), иначе null. */
export async function createFood(draft: FoodDraft, sourceCatalogId: string | null = null): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.foods.add({
    id,
    ...draft,
    sourceCatalogId,
    lastGrams: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  })
  void runSync()
  return id
}

/**
 * Правка продукта/блюда меняет и все записи дневника с ним — название и
 * КБЖУ на 100 г, граммы остаются (владелица, после этапа 6; раньше запись
 * была неизменным снимком). Не хочешь трогать прошлое — «Сохранить как
 * копию» в форме, это `createFood`.
 */
export async function updateFood(id: string, draft: FoodDraft): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.foods, db.entries, async () => {
    await db.foods.update(id, { ...draft, updatedAt: now, dirty: true })
    await db.entries
      .where('foodId')
      .equals(id)
      .filter((e) => e.deletedAt === null)
      .modify({
        name: draft.name,
        brand: null,
        protein: draft.protein,
        fat: draft.fat,
        carbs: draft.carbs,
        kcal: draft.kcal,
        updatedAt: now,
        dirty: true,
      })
  })
  void runSync()
}

/** Сколько живых записей дневника с этим продуктом — подсказка в форме правки. */
export function countFoodEntries(id: string): Promise<number> {
  return db.entries
    .where('foodId')
    .equals(id)
    .filter((e) => e.deletedAt === null)
    .count()
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
