/**
 * Расчёты КБЖУ — одна функция на весь проект (README: «Калории из БЖУ»),
 * чтобы форма продукта, окно граммов и лента считали одинаково.
 */

/** Принимает и запятую, и точку (`inputmode="decimal"`). Пустая строка/мусор → null. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** ккал = Б×4 + Ж×9 + У×4. */
export function kcalFromMacros(protein: number, fat: number, carbs: number): number {
  return protein * 4 + fat * 9 + carbs * 4
}

/** Азиатская этикетка «Serving size 30 g» → пересчёт на 100 г для хранения. */
export function perServingToPer100(valuePerServing: number, servingGrams: number): number {
  if (servingGrams <= 0) return 0
  return (valuePerServing / servingGrams) * 100
}

/** Б+Ж+У больше 100 г на 100 г продукта — вероятная опечатка. */
export function macrosExceed100(protein: number, fat: number, carbs: number): boolean {
  return protein + fat + carbs > 100
}

/**
 * Насколько вписанные ккал расходятся с расчётом по БЖУ, в процентах от
 * расчётного значения. Больше 10% — мягкая подсказка «по БЖУ выходит N»
 * (не ошибка, этикетки округляют).
 */
export function kcalMismatchPercent(entered: number, protein: number, fat: number, carbs: number): number {
  const computed = kcalFromMacros(protein, fat, carbs)
  if (computed === 0) return 0
  return (Math.abs(entered - computed) / computed) * 100
}

export interface Macros {
  protein: number
  fat: number
  carbs: number
  kcal: number
}

/** Продукт/блюдо хранит КБЖУ на 100 г; запись в дневнике — граммы конкретной порции. */
export function scaleByGrams(per100: Macros, grams: number): Macros {
  const factor = grams / 100
  return {
    protein: per100.protein * factor,
    fat: per100.fat * factor,
    carbs: per100.carbs * factor,
    kcal: per100.kcal * factor,
  }
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (acc, m) => ({
      protein: acc.protein + m.protein,
      fat: acc.fat + m.fat,
      carbs: acc.carbs + m.carbs,
      kcal: acc.kcal + m.kcal,
    }),
    { protein: 0, fat: 0, carbs: 0, kcal: 0 },
  )
}
