import { describe, expect, it } from 'vitest'
import {
  applyDayTypeDelta,
  computeDayBoundsStatus,
  computeDayGoal,
  effectiveMaxBounds,
  dayActivityKcal,
  energyDifference,
  hasBaseGoal,
  isDayTypeDeltaConfigured,
  manualDayTypeDelta,
  nutrientBoundStatus,
  pickGoalSettingsForDate,
  statsDayTypeDelta,
  sumActivityKcal,
  type GoalInput,
} from './goals'

const settings: GoalInput = {
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
  minKcal: null,
  maxKcal: null,
  minProtein: null,
  maxProtein: null,
  minFat: null,
  maxFat: null,
  minCarbs: null,
  maxCarbs: null,
  maxFollowsActivity: false,
}

/** Все настройки в этом файле заполнены — цель точно есть, разворачиваем null для краткости тестов. */
function goal(input: GoalInput, activityKcal: number) {
  const g = computeDayGoal(input, activityKcal)
  if (!g) throw new Error('expected a goal, got null')
  return g
}

describe('computeDayGoal', () => {
  it('без активности — цель равна базе, потрачено — энергии покоя', () => {
    const g = goal(settings, 0)
    expect(g.protein).toBe(120)
    expect(g.fat).toBe(60)
    expect(g.carbs).toBe(150)
    expect(g.kcal).toBe(120 * 4 + 60 * 9 + 150 * 4)
    expect(g.spentKcal).toBe(1450)
    expect(g.changedByActivity).toBe(false)
  })

  it('пример из README: 500 ккал активности → +90 г углеводов, потрачено 1950', () => {
    const g = goal(settings, 500)
    expect(g.carbs).toBe(150 + 90)
    expect(g.protein).toBe(120)
    expect(g.fat).toBe(60)
    expect(g.spentKcal).toBe(1450 + 500)
    expect(g.changedByActivity).toBe(true)
  })

  it('⚡ только у макроса, который реально выше базы — не у всех подряд', () => {
    const g = goal(settings, 500)
    expect(g.carbsChanged).toBe(true)
    expect(g.proteinChanged).toBe(false)
    expect(g.fatChanged).toBe(false)
  })

  it('активность есть, но все «на 100 ккал» — 0 — цель не двигается, ⚡ нет', () => {
    const g = goal({ ...settings, perHundredCarbs: 0 }, 500)
    expect(g.carbs).toBe(150)
    expect(g.changedByActivity).toBe(false)
  })

  it('«на 100 ккал» не заполнено (null) — то же самое, что 0, не блокирует цель', () => {
    const g = goal({ ...settings, perHundredProtein: null, perHundredFat: null, perHundredCarbs: null }, 500)
    expect(g.protein).toBe(120)
    expect(g.fat).toBe(60)
    expect(g.carbs).toBe(150)
    expect(g.changedByActivity).toBe(false)
  })

  it('прибавка только положительная — отрицательная активность не опускает цель ниже базы', () => {
    const g = goal(settings, -200)
    expect(g.protein).toBe(120)
    expect(g.carbs).toBe(150)
    expect(g.spentKcal).toBe(1450)
    expect(g.changedByActivity).toBe(false)
  })

  it('ккал цели считается из БЖУ цели, не из базовых ккал + доля активности', () => {
    const g = goal(settings, 500)
    expect(g.kcal).toBe(g.protein * 4 + g.fat * 9 + g.carbs * 4)
  })

  it('база неполная (или пустая совсем) — цели нет, null (владелица: «без цели тоже можно жить»)', () => {
    expect(computeDayGoal({ ...settings, baseCarbs: null }, 0)).toBeNull()
    expect(computeDayGoal({ ...settings, restingKcal: null }, 0)).toBeNull()
    const empty: GoalInput = {
      baseProtein: null,
      baseFat: null,
      baseCarbs: null,
      restingKcal: null,
      perHundredProtein: null,
      perHundredFat: null,
      perHundredCarbs: null,
      highDeltaProtein: null,
      highDeltaFat: null,
      highDeltaCarbs: null,
      lowDeltaProtein: null,
      lowDeltaFat: null,
      lowDeltaCarbs: null,
      minKcal: null,
      maxKcal: null,
      minProtein: null,
      maxProtein: null,
      minFat: null,
      maxFat: null,
      minCarbs: null,
      maxCarbs: null,
      maxFollowsActivity: false,
    }
    expect(computeDayGoal(empty, 0)).toBeNull()
  })
})

describe('hasBaseGoal', () => {
  it('все четыре поля на месте — true', () => {
    expect(hasBaseGoal(settings)).toBe(true)
  })
  it('хоть одно из четырёх пустое — false', () => {
    expect(hasBaseGoal({ ...settings, baseFat: null })).toBe(false)
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

describe('dayActivityKcal', () => {
  it('ручные + активная энергия из Здоровья складываются', () => {
    expect(dayActivityKcal([{ kcal: 300 }], { totalActiveKcal: 1152 })).toBe(1452)
  })
  it('нет данных из Здоровья — только ручные', () => {
    expect(dayActivityKcal([{ kcal: 300 }], null)).toBe(300)
  })
  it('строка из Здоровья есть, но активная ещё не пришла (только покой) — не ломает счёт', () => {
    expect(dayActivityKcal([], { totalActiveKcal: null })).toBe(0)
  })
  it('поднимает цель через «на 100 ккал» так же, как ручная активность', () => {
    const g = goal(settings, dayActivityKcal([], { totalActiveKcal: 500 }))
    expect(g.carbs).toBe(150 + 90) // 500/100 × 18
    expect(g.spentKcal).toBe(1450 + 500)
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

describe('isDayTypeDeltaConfigured', () => {
  it('все три поля заданы — true', () => {
    expect(isDayTypeDeltaConfigured('high', settings)).toBe(true)
    expect(isDayTypeDeltaConfigured('low', settings)).toBe(true)
  })
  it('хоть одно из трёх пустое — false (частично заполненная тройка не считается)', () => {
    expect(isDayTypeDeltaConfigured('high', { ...settings, highDeltaCarbs: null })).toBe(false)
  })
  it('не настроен только high — low это не задевает', () => {
    const partial = { ...settings, highDeltaProtein: null, highDeltaFat: null, highDeltaCarbs: null }
    expect(isDayTypeDeltaConfigured('high', partial)).toBe(false)
    expect(isDayTypeDeltaConfigured('low', partial)).toBe(true)
  })
})

describe('manualDayTypeDelta', () => {
  it('высокоуглеводный — прибавка как задана в настройках', () => {
    expect(manualDayTypeDelta('high', settings)).toEqual({ protein: 0, fat: 0, carbs: 90 })
  })

  it('низкоуглеводный — убавка (хранится как положительная величина, применяется с минусом)', () => {
    expect(manualDayTypeDelta('low', settings)).toEqual({ protein: -0, fat: -0, carbs: -60 })
  })

  it('не настроено целиком (хоть одно поле пустое) — null, не 0', () => {
    expect(manualDayTypeDelta('low', { ...settings, lowDeltaCarbs: null })).toBeNull()
  })
})

describe('applyDayTypeDelta', () => {
  it('складывается с уже посчитанной целью, пересчитывает ккал', () => {
    const g = goal(settings, 0)
    const withDelta = applyDayTypeDelta(g, { protein: 0, fat: 0, carbs: 90 })
    expect(withDelta.carbs).toBe(240)
    expect(withDelta.kcal).toBe(120 * 4 + 60 * 9 + 240 * 4)
    // spentKcal — не по этой стороне: тип дня не про расход, только про цель БЖУ
    expect(withDelta.spentKcal).toBe(g.spentKcal)
  })

  it('delta = null — цель не меняется', () => {
    const g = goal(settings, 0)
    expect(applyDayTypeDelta(g, null)).toEqual(g)
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

  it('нет базы — не из чего вычитать, null', () => {
    const dayTypeRows = [{ date: '2026-01-05', actual: 'high' as const }]
    const entries = [entry('2026-01-05', 260)]
    expect(statsDayTypeDelta('high', { baseProtein: null, baseFat: 60, baseCarbs: 150 }, entries, dayTypeRows, null, '2026-01-10')).toBeNull()
  })
})

describe('nutrientBoundStatus', () => {
  it('обе границы не заданы — null, подсвечивать нечего', () => {
    expect(nutrientBoundStatus(100, null, null)).toBeNull()
  })

  it('ниже минимума — under', () => {
    expect(nutrientBoundStatus(50, 80, null)).toBe('under')
  })

  it('ровно на минимуме — ok, не under', () => {
    expect(nutrientBoundStatus(80, 80, null)).toBe('ok')
  })

  it('выше максимума — over', () => {
    expect(nutrientBoundStatus(120, null, 100)).toBe('over')
  })

  it('ровно на максимуме — ok, не over', () => {
    expect(nutrientBoundStatus(100, null, 100)).toBe('ok')
  })

  it('между минимумом и максимумом — ok', () => {
    expect(nutrientBoundStatus(90, 80, 100)).toBe('ok')
  })

  it('задан только минимум, значение выше него — ok (верхней границы нет)', () => {
    expect(nutrientBoundStatus(9999, 80, null)).toBe('ok')
  })
})

describe('computeDayBoundsStatus', () => {
  const bounds = {
    minKcal: 1500,
    maxKcal: 2200,
    minProtein: 100,
    maxProtein: null,
    minFat: null,
    maxFat: 80,
    minCarbs: null,
    maxCarbs: null,
    maxFollowsActivity: false,
    perHundredProtein: null,
    perHundredFat: null,
    perHundredCarbs: null,
  }

  it('считает независимо по каждому нутриенту, включая полностью незаданные', () => {
    const status = computeDayBoundsStatus(bounds, { kcal: 1400, protein: 120, fat: 90, carbs: 300 }, 0)
    expect(status.kcal).toBe('under') // ниже 1500
    expect(status.protein).toBe('ok') // выше 100, верхней нет
    expect(status.fat).toBe('over') // выше 80
    expect(status.carbs).toBeNull() // границ по У вообще нет
  })
})

describe('effectiveMaxBounds', () => {
  const bounds = {
    minKcal: 1500,
    maxKcal: 2000,
    minProtein: 100,
    maxProtein: 150,
    minFat: null,
    maxFat: 70,
    minCarbs: null,
    maxCarbs: null,
    perHundredProtein: 2,
    perHundredFat: null,
    perHundredCarbs: 18,
    maxFollowsActivity: true,
  }

  it('галочка включена: макс ккал + активность, макс Б/Ж/У + «на 100 ккал»', () => {
    expect(effectiveMaxBounds(bounds, 500)).toEqual({ maxKcal: 2500, maxProtein: 160, maxFat: 70, maxCarbs: null })
  })

  it('галочка выключена — границы как вписаны', () => {
    expect(effectiveMaxBounds({ ...bounds, maxFollowsActivity: false }, 500)).toEqual({
      maxKcal: 2000,
      maxProtein: 150,
      maxFat: 70,
      maxCarbs: null,
    })
  })

  it('перебор по вписанному максимуму уже не перебор, если активность подняла границу; минимум не двигается', () => {
    const status = computeDayBoundsStatus(bounds, { kcal: 2300, protein: 90, fat: 50, carbs: 250 }, 500)
    expect(status.kcal).toBe('ok')
    expect(status.protein).toBe('under')
  })
})
