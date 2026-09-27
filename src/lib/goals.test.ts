import { describe, expect, it } from 'vitest'
import { computeDayGoal, pickGoalSettingsForDate, sumActivityKcal } from './goals'

const settings = {
  baseProtein: 120,
  baseFat: 60,
  baseCarbs: 150,
  restingKcal: 1450,
  perHundredProtein: 0,
  perHundredFat: 0,
  perHundredCarbs: 18,
}

describe('computeDayGoal', () => {
  it('без активности — цель равна базе, потрачено — энергии покоя', () => {
    const goal = computeDayGoal(settings, 0)
    expect(goal.protein).toBe(120)
    expect(goal.fat).toBe(60)
    expect(goal.carbs).toBe(150)
    expect(goal.kcal).toBe(120 * 4 + 60 * 9 + 150 * 4)
    expect(goal.spentKcal).toBe(1450)
    expect(goal.changedByActivity).toBe(false)
  })

  it('пример из README: 500 ккал активности → +90 г углеводов, потрачено 1950', () => {
    const goal = computeDayGoal(settings, 500)
    expect(goal.carbs).toBe(150 + 90)
    expect(goal.protein).toBe(120)
    expect(goal.fat).toBe(60)
    expect(goal.spentKcal).toBe(1450 + 500)
    expect(goal.changedByActivity).toBe(true)
  })

  it('прибавка только положительная — отрицательная активность не опускает цель ниже базы', () => {
    const goal = computeDayGoal(settings, -200)
    expect(goal.protein).toBe(120)
    expect(goal.carbs).toBe(150)
    expect(goal.spentKcal).toBe(1450)
  })

  it('ккал цели считается из БЖУ цели, не из базовых ккал + доля активности', () => {
    const goal = computeDayGoal(settings, 500)
    expect(goal.kcal).toBe(goal.protein * 4 + goal.fat * 9 + goal.carbs * 4)
  })
})

describe('sumActivityKcal', () => {
  it('сумма ккал по всем активностям дня', () => {
    expect(sumActivityKcal([{ kcal: 320 }, { kcal: 150 }])).toBe(470)
  })
  it('без активностей — 0', () => {
    expect(sumActivityKcal([])).toBe(0)
  })
})

describe('pickGoalSettingsForDate', () => {
  const v1 = { validFrom: '2026-01-01', createdAt: '2026-01-01T10:00:00.000Z' }
  const v2 = { validFrom: '2026-01-10', createdAt: '2026-01-10T10:00:00.000Z' }

  it('берёт версию с максимальным validFrom ≤ дата', () => {
    expect(pickGoalSettingsForDate([v1, v2], '2026-01-15')).toBe(v2)
    expect(pickGoalSettingsForDate([v1, v2], '2026-01-05')).toBe(v1)
  })

  it('прошлый день не задевает более новая версия', () => {
    expect(pickGoalSettingsForDate([v1, v2], '2026-01-02')).toBe(v1)
  })

  it('нет подходящей версии (дата раньше самой первой) — null', () => {
    expect(pickGoalSettingsForDate([v1, v2], '2025-12-31')).toBeNull()
  })

  it('несколько правок в один день — берём более новую по createdAt', () => {
    const same1 = { validFrom: '2026-01-10', createdAt: '2026-01-10T09:00:00.000Z' }
    const same2 = { validFrom: '2026-01-10', createdAt: '2026-01-10T18:00:00.000Z' }
    expect(pickGoalSettingsForDate([same1, same2], '2026-01-10')).toBe(same2)
  })

  it('нет ни одной версии — null', () => {
    expect(pickGoalSettingsForDate([], '2026-01-10')).toBeNull()
  })
})
