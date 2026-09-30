import { describe, expect, it } from 'vitest'
import type { GoalSettings } from './db'
import { createDaySummarizer, datesBackwards, earliestEntryDate, periodAverages, statsPeriod, type StatsSource } from './stats'

const settings: GoalSettings = {
  id: 'g1',
  validFrom: '2026-09-01',
  baseProtein: 100,
  baseFat: 50,
  baseCarbs: 200,
  restingKcal: 1500,
  perHundredProtein: 0,
  perHundredFat: 0,
  perHundredCarbs: 10,
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
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  deletedAt: null,
  dirty: false,
}

// 100 г «продукта» 10/5/50, 305 ккал на 100 г
const food = { protein: 10, fat: 5, carbs: 50, kcal: 305 }

const source: StatsSource = {
  entries: [
    { date: '2026-09-21', ...food, grams: 200 },
    { date: '2026-09-21', ...food, grams: 100 },
    { date: '2026-09-22', ...food, grams: 500 },
    { date: '2026-08-30', ...food, grams: 100 }, // до первой версии настроек
  ],
  activities: [{ date: '2026-09-21', kcal: 200 }],
  health: [{ date: '2026-09-21', totalActiveKcal: 300 }],
  goalSettings: [settings],
}

describe('createDaySummarizer', () => {
  const summarize = createDaySummarizer(source)

  it('съедено, цель с активностью (ручная + Здоровье), потрачено, разница', () => {
    const s = summarize('2026-09-21')
    expect(s.hasEntries).toBe(true)
    expect(s.eaten).toEqual({ protein: 30, fat: 15, carbs: 150, kcal: 915 })
    expect(s.goal!.carbs).toBe(220) // 200 + 200/100 × 10 — прибавка только от ручной тренировки, не от Здоровья
    expect(s.spentKcal).toBe(2000) // 1500 + 200 + 300
    expect(s.differenceKcal).toBe(-1085)
    expect(s.status.kcal).toBe('ok') // 915 ≤ цели
  })

  it('статистика — «Факт»: без активности цель = база, съела больше — перебор', () => {
    const s = summarize('2026-09-22')
    expect(s.goal!.carbs).toBe(200)
    expect(s.status.carbs).toBe('over') // 250 при цели 200
  })

  it('день до первой версии настроек — без цели, потрачено неизвестно, цвет серый', () => {
    const s = summarize('2026-08-30')
    expect(s.goal).toBeNull()
    expect(s.spentKcal).toBeNull()
    expect(s.differenceKcal).toBeNull()
    expect(s.status.kcal).toBeNull()
  })

  it('день без записей', () => {
    const s = summarize('2026-09-23')
    expect(s.hasEntries).toBe(false)
    expect(s.eaten.kcal).toBe(0)
    expect(s.spentKcal).toBe(1500)
  })
})

describe('earliestEntryDate / datesBackwards', () => {
  it('самая ранняя дата', () => {
    expect(earliestEntryDate(source.entries)).toBe('2026-08-30')
    expect(earliestEntryDate([])).toBeNull()
  })

  it('от свежих к старым, не раньше границы', () => {
    expect(datesBackwards('2026-09-02', 5, '2026-08-31')).toEqual(['2026-09-02', '2026-09-01', '2026-08-31'])
  })
})

describe('statsPeriod', () => {
  it('неделя — пн…вс, стрелка назад — предыдущая', () => {
    expect(statsPeriod('week', '2026-09-30', 0).dates[0]).toBe('2026-09-28')
    expect(statsPeriod('week', '2026-09-30', -1).dates).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ])
  })

  it('месяц — календарный, через границу года', () => {
    const jan = statsPeriod('month', '2026-01-15', 0).dates
    expect(jan[0]).toBe('2026-01-01')
    expect(jan.length).toBe(31)
    expect(statsPeriod('month', '2026-01-15', -1).dates.at(-1)).toBe('2025-12-31')
  })

  it('3 месяца — последний текущий, назад — следующие три', () => {
    const q = statsPeriod('quarter', '2026-09-30', 0).dates
    expect(q[0]).toBe('2026-07-01')
    expect(q.at(-1)).toBe('2026-09-30')
    expect(statsPeriod('quarter', '2026-09-30', -1).dates[0]).toBe('2026-04-01')
  })
})

describe('periodAverages', () => {
  const summarize = createDaySummarizer(source)

  it('без пустых дней и без сегодняшнего; потрачено — только где есть цель', () => {
    const days = ['2026-08-30', '2026-09-21', '2026-09-22', '2026-09-23'].map(summarize)
    const avg = periodAverages(days, '2026-09-22') // 22-е — «сегодня», 23-е — будущее и пустое
    expect(avg.days).toBe(2) // 30.08 и 21.09
    expect(avg.eaten!.kcal).toBe((305 + 915) / 2)
    expect(avg.spentKcal).toBe(2000) // только 21.09 — у 30.08 цели нет
    expect(avg.totalDifferenceKcal).toBe(-1085)
  })

  it('ни одного дня — всё null', () => {
    expect(periodAverages([summarize('2026-09-23')], '2026-09-30')).toEqual({
      days: 0,
      eaten: null,
      spentKcal: null,
      differenceKcal: null,
      totalDifferenceKcal: null,
    })
  })
})
