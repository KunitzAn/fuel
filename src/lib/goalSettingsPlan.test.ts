import { describe, expect, it } from 'vitest'
import type { GoalSettings } from './db'
import { pickGoalSettingsForDate, type GoalInput } from './goals'
import { planGoalSettingsSave, replacedVersionDates } from './goalSettingsPlan'

const base: Omit<GoalSettings, 'id' | 'validFrom' | 'baseCarbs'> = {
  baseProtein: 100, baseFat: 20, restingKcal: 1140,
  perHundredProtein: null, perHundredFat: null, perHundredCarbs: null,
  highDeltaProtein: null, highDeltaFat: null, highDeltaCarbs: null,
  lowDeltaProtein: null, lowDeltaFat: null, lowDeltaCarbs: null,
  minKcal: null, maxKcal: null, minProtein: null, maxProtein: null, minFat: null, maxFat: null, minCarbs: null, maxCarbs: null,
  maxFollowsActivity: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', deletedAt: null, dirty: false,
}
const row = (id: string, validFrom: string, baseCarbs: number): GoalSettings => ({ ...base, id, validFrom, baseCarbs })
const rows = [row('a', '2026-09-01', 140), row('b', '2026-09-30', 150), row('c', '2026-10-10', 160)]
const draft = { ...base, baseCarbs: 200 } as unknown as GoalInput

// Применяет план к строкам так же, как goalSettings.ts, и спрашивает, какая версия действует на дату
function apply(range: { from: string; to: string | null }) {
  const plan = planGoalSettingsSave(rows, draft, range)
  const kept = rows.filter((r) => !plan.deleteIds.includes(r.id))
  const added = plan.inserts.map((r, i) => ({ ...base, ...r, id: `n${i}`, createdAt: `2026-10-20T00:00:0${i}Z` }) as GoalSettings)
  const all = [...kept, ...added]
  return { plan, carbsOn: (d: string) => pickGoalSettingsForDate(all, d)?.baseCarbs ?? null }
}

describe('planGoalSettingsSave', () => {
  it('с даты и дальше: новые цифры везде с этой даты, более поздние версии заменены', () => {
    const { plan, carbsOn } = apply({ from: '2026-09-27', to: null })
    expect(plan.deleteIds).toEqual(['b', 'c'])
    expect(carbsOn('2026-09-26')).toBe(140)
    expect(carbsOn('2026-09-27')).toBe(200)
    expect(carbsOn('2026-10-15')).toBe(200)
  })

  it('период: внутри — новые, после — то, что действовало там раньше', () => {
    const { plan, carbsOn } = apply({ from: '2026-09-27', to: '2026-10-02' })
    expect(plan.deleteIds).toEqual(['b'])
    expect(carbsOn('2026-09-26')).toBe(140)
    expect(carbsOn('2026-10-02')).toBe(200)
    expect(carbsOn('2026-10-03')).toBe(150) // была версия b с 30.09
    expect(carbsOn('2026-10-10')).toBe(160) // c не тронута
  })

  it('период до начала любых настроек — после него снова «без настроек»', () => {
    const plan = planGoalSettingsSave([], draft, { from: '2026-08-01', to: '2026-08-10' })
    expect(plan.inserts).toHaveLength(2)
    expect(plan.inserts[1]!.validFrom).toBe('2026-08-11')
    expect(plan.inserts[1]!.baseProtein).toBeNull()
  })

  it('версия прямо на следующий день после периода уже есть — возвращать нечего', () => {
    const plan = planGoalSettingsSave(rows, draft, { from: '2026-09-20', to: '2026-09-29' })
    expect(plan.inserts).toHaveLength(1)
  })
})

describe('replacedVersionDates', () => {
  it('какие версии заменит', () => {
    expect(replacedVersionDates(rows, { from: '2026-09-27', to: null })).toEqual(['2026-09-30', '2026-10-10'])
    expect(replacedVersionDates(rows, { from: '2026-10-01', to: '2026-10-05' })).toEqual([])
  })
})
