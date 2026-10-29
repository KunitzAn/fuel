import { describe, expect, it } from 'vitest'
import { kcalPer100FromForm, macrosPer100FromForm } from './foods'

describe('форма продукта «на порцию» → на 100 г', () => {
  // Случай владелицы (28.10): банка кофе 238 г — Б 3, Ж 0, У 17, 80 ккал
  it('БЖУ и ккал пересчитываются одинаково', () => {
    const m = macrosPer100FromForm('perServing', 238, 3, 0, 17)
    const kcal = kcalPer100FromForm('perServing', 238, 80)
    expect(m.protein).toBeCloseTo(1.26, 2)
    expect(m.carbs).toBeCloseTo(7.14, 2)
    expect(kcal).toBeCloseTo(33.6, 1)
    // и 1 порция обратно — ровно то, что на этикетке
    expect((kcal * 238) / 100).toBeCloseTo(80, 5)
    expect((m.carbs * 238) / 100).toBeCloseTo(17, 5)
  })

  it('«на 100 г» — как ввели', () => {
    expect(kcalPer100FromForm('per100', 238, 80)).toBe(80)
    expect(macrosPer100FromForm('per100', 238, 3, 0, 17)).toEqual({ protein: 3, fat: 0, carbs: 17 })
  })
})
