import { describe, expect, it } from 'vitest'
import {
  applyDayTypeDelta,
  computeDayGoal,
  energyDifference,
  manualDayTypeDelta,
  pickGoalSettingsForDate,
  statsDayTypeDelta,
  sumActivityKcal,
} from './goals'

const settings = {
  baseProtein: 120,
  baseFat: 60,
  baseCarbs: 150,
  restingKcal: 1450,
  perHundredProtein: 0,
  perHundredFat: 0,
  perHundredCarbs: 18,
  highDeltaProtein: 0,
  highDeltaFat: 0,
  highDeltaCarbs: 90,
  lowDeltaProtein: 0,
  lowDeltaFat: 0,
  lowDeltaCarbs: 60,
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

  it('⚡ только у макроса, который реально выше базы — не у всех подряд', () => {
    const goal = computeDayGoal(settings, 500)
    expect(goal.carbsChanged).toBe(true)
    expect(goal.proteinChanged).toBe(false)
    expect(goal.fatChanged).toBe(false)
  })

  it('активность есть, но все «на 100 ккал» — 0 — цель не двигается, ⚡ нет', () => {
    const goal = computeDayGoal({ ...settings, perHundredCarbs: 0 }, 500)
    expect(goal.carbs).toBe(150)
    expect(goal.changedByActivity).toBe(false)
  })

  it('прибавка только положительная — отрицательная активность не опускает цель ниже базы', () => {
    const goal = computeDayGoal(settings, -200)
    expect(goal.protein).toBe(120)
    expect(goal.carbs).toBe(150)
    expect(goal.spentKcal).toBe(1450)
    expect(goal.changedByActivity).toBe(false)
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

describe('energyDifference', () => {
  it('минус — дефицит, плюс — избыток', () => {
    expect(energyDifference(1300, 1950)).toBe(-650)
    expect(energyDifference(2000, 1950)).toBe(50)
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

describe('manualDayTypeDelta', () => {
  it('высокоуглеводный — прибавка как задана в настройках', () => {
    expect(manualDayTypeDelta('high', settings)).toEqual({ protein: 0, fat: 0, carbs: 90 })
  })

  it('низкоуглеводный — убавка (хранится как положительная величина, применяется с минусом)', () => {
    expect(manualDayTypeDelta('low', settings)).toEqual({ protein: -0, fat: -0, carbs: -60 })
  })
})

describe('applyDayTypeDelta', () => {
  it('складывается с уже посчитанной целью, пересчитывает ккал', () => {
    const goal = computeDayGoal(settings, 0)
    const withDelta = applyDayTypeDelta(goal, { protein: 0, fat: 0, carbs: 90 })
    expect(withDelta.carbs).toBe(240)
    expect(withDelta.kcal).toBe(120 * 4 + 60 * 9 + 240 * 4)
    // spentKcal — не по этой стороне: тип дня не про расход, только про цель БЖУ
    expect(withDelta.spentKcal).toBe(goal.spentKcal)
  })

  it('delta = null — цель не меняется', () => {
    const goal = computeDayGoal(settings, 0)
    expect(applyDayTypeDelta(goal, null)).toEqual(goal)
  })
})

describe('statsDayTypeDelta', () => {
  const base = { baseProtein: 120, baseFat: 60, baseCarbs: 150 }
  const entry = (date: string, carbs: number) => ({ date, protein: 0, fat: 0, carbs, kcal: carbs * 4, grams: 100 })

  it('среднее по факту прошлых high-дней минус база', () => {
    const dayTypeRows = [
      { date: '2026-01-05', actual: 'high' as const },
      { date: '2026-01-06', actual: 'high' as const },
      { date: '2026-01-07', actual: 'low' as const },
    ]
    // 05.01: 260г угля (одна запись на 100г), 06.01: 220г
    const entries = [entry('2026-01-05', 260), entry('2026-01-06', 220), entry('2026-01-07', 40)]
    const delta = statsDayTypeDelta('high', base, entries, dayTypeRows, null, '2026-01-10')
    expect(delta).not.toBeNull()
    expect(delta!.carbs).toBeCloseTo((260 + 220) / 2 - 150) // = 90
  })

  it('сегодняшний день не в счёт — у него ещё нет факта', () => {
    const dayTypeRows = [{ date: '2026-01-10', actual: 'high' as const }]
    const entries = [entry('2026-01-10', 500)]
    expect(statsDayTypeDelta('high', base, entries, dayTypeRows, null, '2026-01-10')).toBeNull()
  })

  it('день без единой записи в дневнике не портит среднее нулём', () => {
    const dayTypeRows = [
      { date: '2026-01-05', actual: 'high' as const },
      { date: '2026-01-06', actual: 'high' as const }, // не открывала приложение в этот день
    ]
    const entries = [entry('2026-01-05', 260)]
    const delta = statsDayTypeDelta('high', base, entries, dayTypeRows, null, '2026-01-10')
    expect(delta!.carbs).toBeCloseTo(260 - 150) // = 110, не (260+0)/2
  })

  it('период ограничивает выборку', () => {
    const dayTypeRows = [
      { date: '2025-01-01', actual: 'high' as const }, // старый, за периодом
      { date: '2026-01-05', actual: 'high' as const },
    ]
    const entries = [entry('2025-01-01', 400), entry('2026-01-05', 260)]
    const delta = statsDayTypeDelta('high', base, entries, dayTypeRows, 30, '2026-01-10')
    expect(delta!.carbs).toBeCloseTo(260 - 150) // только январский день
  })

  it('нет ни одного прошлого дня этого типа — null', () => {
    expect(statsDayTypeDelta('high', base, [], [], null, '2026-01-10')).toBeNull()
  })
})
