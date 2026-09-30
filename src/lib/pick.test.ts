import { describe, expect, it } from 'vitest'
import { withBrand } from './pick'

describe('withBrand', () => {
  it('марка спереди названия', () => {
    expect(withBrand('Творог 1,8%', 'Моя Цена')).toBe('Моя Цена Творог 1,8%')
  })
  it('без марки — как есть', () => {
    expect(withBrand('Винегрет', null)).toBe('Винегрет')
    expect(withBrand('Винегрет', '  ')).toBe('Винегрет')
  })
  it('марка уже в названии (любой регистр) — не дублируем', () => {
    expect(withBrand('Milky Way со вкусом черники', 'milky way')).toBe('Milky Way со вкусом черники')
  })
})
