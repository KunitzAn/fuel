/**
 * Расчёт цели дня (README «Цели и энергия», плюс этап 4.4 — тип дня, не из
 * README). Единственное место в проекте, где юнит-тесты обязательны
 * (PLAN.md, этап 4.2) — формулы легко тихо сломать, а рефакторить их будем
 * не глядя на экран каждый раз.
 */
import { shiftDate } from './date'
import type { Activity, DailyActiveEnergy, DayType, Entry, GoalSettings } from './db'
import { kcalFromMacros, scaleByGrams, sumMacros, type Macros } from './nutrition'

/**
 * Все числовые поля необязательные (владелица: «это все необязательные
 * настройки») — база (Б/Ж/У/покой) неполная или пустая целиком → цели нет,
 * high/low неполные (хоть одно поле своей тройки) → этот тип дня
 * недоступен на выбор. «На 100 ккал» пустое — не блокирует цель, просто 0
 * (нет бонуса от активности), особого «не задано» ему не нужно.
 */
export interface GoalInput {
  baseProtein: number | null
  baseFat: number | null
  baseCarbs: number | null
  restingKcal: number | null
  perHundredProtein: number | null
  perHundredFat: number | null
  perHundredCarbs: number | null
  highDeltaProtein: number | null
  highDeltaFat: number | null
  highDeltaCarbs: number | null
  lowDeltaProtein: number | null
  lowDeltaFat: number | null
  lowDeltaCarbs: number | null
  minKcal: number | null
  maxKcal: number | null
  minProtein: number | null
  maxProtein: number | null
  minFat: number | null
  maxFat: number | null
  minCarbs: number | null
  maxCarbs: number | null
  maxFollowsActivity: boolean
}

export interface DayGoal {
  protein: number
  fat: number
  carbs: number
  kcal: number
  activityKcal: number
  spentKcal: number // энергия покоя + активность
  /** Который из макросов реально выросли от активности — ⚡ у той ячейки в шапке (README). */
  proteinChanged: boolean
  fatChanged: boolean
  carbsChanged: boolean
  /** ⚡ у ккал/общий флаг — вырос хоть один макрос. */
  changedByActivity: boolean
}

/** Есть полная база (Б/Ж/У + покой) — без неё цели не бывает вообще (владелица: «без цели тоже можно жить»). */
export function hasBaseGoal(settings: Pick<GoalInput, 'baseProtein' | 'baseFat' | 'baseCarbs' | 'restingKcal'>): boolean {
  return settings.baseProtein !== null && settings.baseFat !== null && settings.baseCarbs !== null && settings.restingKcal !== null
}

/**
 * Без настроек и активности: цель = база, потрачено = покой (README
 * «Без синхронизации и ручных записей»). Прибавка только положительная —
 * минимумов по макросам нет, activityKcal ниже 0 не бывает (сумма ккал
 * тренировок/активностей), но на всякий случай не даём цели уйти ниже базы.
 *
 * `changedByActivity` — не «была ли активность», а «хоть один макрос
 * реально вырос»: при перекосе настроек «на 100 ккал» в 0/0/0 по всем
 * макросам активность есть, а цель не двигается — ⚡ показывать нечего.
 *
 * База неполная (или её вовсе нет) — цели не бывает, `null`.
 */
export function computeDayGoal(settings: GoalInput, activityKcal: number): DayGoal | null {
  if (!hasBaseGoal(settings)) return null
  const clampedActivity = Math.max(0, activityKcal)
  const protein = settings.baseProtein! + (clampedActivity / 100) * (settings.perHundredProtein ?? 0)
  const fat = settings.baseFat! + (clampedActivity / 100) * (settings.perHundredFat ?? 0)
  const carbs = settings.baseCarbs! + (clampedActivity / 100) * (settings.perHundredCarbs ?? 0)
  const proteinChanged = protein > settings.baseProtein!
  const fatChanged = fat > settings.baseFat!
  const carbsChanged = carbs > settings.baseCarbs!
  return {
    protein,
    fat,
    carbs,
    kcal: kcalFromMacros(protein, fat, carbs),
    activityKcal: clampedActivity,
    spentKcal: settings.restingKcal! + clampedActivity,
    proteinChanged,
    fatChanged,
    carbsChanged,
    changedByActivity: proteinChanged || fatChanged || carbsChanged,
  }
}

export function sumActivityKcal(activities: Pick<Activity, 'kcal'>[]): number {
  return activities.reduce((sum, a) => sum + a.kcal, 0)
}

/**
 * Активность дня для цели и «потрачено» = ручные активности + активная
 * энергия за день из Здоровья (Команда iOS, этап 5.2). Владелица решила
 * складывать всё, даже если тренировка есть и там, и там — риск двойного
 * счёта на её стороне. Нет данных из Здоровья — только ручные.
 */
export function dayActivityKcal(
  activities: Pick<Activity, 'kcal'>[],
  health: Pick<DailyActiveEnergy, 'totalActiveKcal'> | null,
): number {
  return sumActivityKcal(activities) + (health?.totalActiveKcal ?? 0)
}

/** README: «разница = съедено − потрачено» — минус означает дефицит. */
export function energyDifference(eatenKcal: number, spentKcal: number): number {
  return eatenKcal - spentKcal
}

/**
 * Версия настроек, действующая на дату: максимальный `validFrom ≤ date`;
 * при нескольких правках в один день (тот же validFrom) — более новая по
 * `createdAt` (README «История настроек целей» не описывает правку внутри
 * дня отдельно — так проще всего и не противоречит «действует с сегодня»).
 */
export function pickGoalSettingsForDate<T extends Pick<GoalSettings, 'validFrom' | 'createdAt'>>(
  rows: T[],
  date: string,
): T | null {
  let best: T | null = null
  for (const row of rows) {
    if (row.validFrom > date) continue
    if (
      !best ||
      row.validFrom > best.validFrom ||
      (row.validFrom === best.validFrom && row.createdAt > best.createdAt)
    ) {
      best = row
    }
  }
  return best
}

/**
 * Тип дня (этап 4.4, новая мысль владелицы, не из README): высоко-/
 * низкоуглеводный день, отдельно от целей по активности — поправка
 * складывается с базой параллельно поправке на активность, а не заменяет
 * её. Низкоуглеводный хранится в настройках как положительная «убавка»,
 * здесь превращается в отрицательную поправку.
 */
export type DayTypeKind = 'low' | 'high'

export interface DayTypeDelta {
  protein: number
  fat: number
  carbs: number
}

/**
 * Поправка настроена — все три её поля заданы разом (частично заполненная
 * тройка — то же самое, что не заполненная: недостаточно данных, чтобы
 * понять, что имелось в виду). Этим типом дня нельзя воспользоваться, пока
 * не задано целиком — кнопка в дневнике неактивна (DiaryView.vue).
 */
export function isDayTypeDeltaConfigured(kind: DayTypeKind, settings: GoalInput): boolean {
  if (kind === 'high') {
    return settings.highDeltaProtein !== null && settings.highDeltaFat !== null && settings.highDeltaCarbs !== null
  }
  return settings.lowDeltaProtein !== null && settings.lowDeltaFat !== null && settings.lowDeltaCarbs !== null
}

/** Поправка «вручную» — из текущей версии настроек (та же, что база). `null` — не настроено целиком. */
export function manualDayTypeDelta(kind: DayTypeKind, settings: GoalInput): DayTypeDelta | null {
  if (!isDayTypeDeltaConfigured(kind, settings)) return null
  if (kind === 'high') {
    return { protein: settings.highDeltaProtein!, fat: settings.highDeltaFat!, carbs: settings.highDeltaCarbs! }
  }
  return { protein: -settings.lowDeltaProtein!, fat: -settings.lowDeltaFat!, carbs: -settings.lowDeltaCarbs! }
}

/**
 * Поправка «из статистики» — среднее КБЖУ по факту прошлых дней этого же
 * типа минус текущая база: получившееся число складывается с базой точно
 * так же, как и вручную заданная поправка (владелица: «складывается с
 * базовой целью параллельно поправке на активность»). Сегодняшний день (и
 * будущие) в расчёт не берём — у него ещё не может быть факта. Дни без
 * единой записи в `entries` из среднего исключаются (иначе занизили бы
 * его нулём, хотя на самом деле просто не открывала приложение). Без базы
 * вычитать не из чего — `null` (тот же случай, что и «нет цели вообще»).
 */
export function statsDayTypeDelta(
  kind: DayTypeKind,
  base: Pick<GoalInput, 'baseProtein' | 'baseFat' | 'baseCarbs'>,
  entries: Pick<Entry, 'date' | 'protein' | 'fat' | 'carbs' | 'kcal' | 'grams'>[],
  dayTypeRows: Pick<DayType, 'date' | 'actual'>[],
  periodDays: number | null,
  today: string,
): DayTypeDelta | null {
  if (base.baseProtein === null || base.baseFat === null || base.baseCarbs === null) return null
  const cutoff = periodDays !== null ? shiftDate(today, -periodDays) : null
  const matchingDates = new Set(
    dayTypeRows.filter((d) => d.actual === kind && d.date < today && (!cutoff || d.date >= cutoff)).map((d) => d.date),
  )
  if (matchingDates.size === 0) return null

  const totalsByDate = new Map<string, Macros>()
  for (const e of entries) {
    if (!matchingDates.has(e.date)) continue
    const scaled = scaleByGrams(e, e.grams)
    const prev = totalsByDate.get(e.date)
    totalsByDate.set(e.date, prev ? sumMacros([prev, scaled]) : scaled)
  }
  const days = [...totalsByDate.values()]
  if (days.length === 0) return null

  const avg = sumMacros(days)
  return {
    protein: avg.protein / days.length - base.baseProtein,
    fat: avg.fat / days.length - base.baseFat,
    carbs: avg.carbs / days.length - base.baseCarbs,
  }
}

/** Складывает поправку типа дня с уже посчитанной (активностью) целью — независимые слагаемые. */
export function applyDayTypeDelta(goal: DayGoal, delta: DayTypeDelta | null): DayGoal {
  if (!delta) return goal
  const protein = goal.protein + delta.protein
  const fat = goal.fat + delta.fat
  const carbs = goal.carbs + delta.carbs
  return { ...goal, protein, fat, carbs, kcal: kcalFromMacros(protein, fat, carbs) }
}

/**
 * Мин/макс границы нутриентов (этап 4.5, не из README — новая мысль
 * владелицы). Отдельная фича от цели (4.1–4.3) и от поправки на тип дня
 * (4.4) — свои значения, одна пара границ на все дни (владелица: «границы
 * можно использовать как вместе с целями, так и отдельно от целей»).
 * Каждый из четырёх нутриентов независим от остальных — можно задать
 * только нижнюю по белку и ничего больше.
 */
export type BoundStatus = 'under' | 'over' | 'ok'

/** `null` — граница вообще не задана (ни низ, ни верх) для этого нутриента, подсвечивать нечего. */
export function nutrientBoundStatus(eaten: number, min: number | null, max: number | null): BoundStatus | null {
  if (min === null && max === null) return null
  if (min !== null && eaten < min) return 'under'
  if (max !== null && eaten > max) return 'over'
  return 'ok'
}

export interface DayBoundsStatus {
  kcal: BoundStatus | null
  protein: BoundStatus | null
  fat: BoundStatus | null
  carbs: BoundStatus | null
}

type BoundsInput = Pick<
  GoalInput,
  | 'minKcal'
  | 'maxKcal'
  | 'minProtein'
  | 'maxProtein'
  | 'minFat'
  | 'maxFat'
  | 'minCarbs'
  | 'maxCarbs'
  | 'maxFollowsActivity'
  | 'perHundredProtein'
  | 'perHundredFat'
  | 'perHundredCarbs'
>

/**
 * Чекбокс «Верхняя граница растёт с активностью» (владелица, после 5.2):
 * макс ккал + вся активность дня, макс Б/Ж/У + то же «на 100 ккал», что и
 * у цели (не задано — этот макс не двигается). Нижние границы и
 * незаданные верхние не трогаем. Выключено — границы как вписаны.
 */
export function effectiveMaxBounds(
  settings: BoundsInput,
  activityKcal: number,
): Pick<GoalInput, 'maxKcal' | 'maxProtein' | 'maxFat' | 'maxCarbs'> {
  const activity = settings.maxFollowsActivity ? Math.max(0, activityKcal) : 0
  const grow = (max: number | null, perHundred: number | null) =>
    max == null ? null : max + (activity / 100) * (perHundred ?? 0)
  return {
    maxKcal: settings.maxKcal == null ? null : settings.maxKcal + activity,
    maxProtein: grow(settings.maxProtein, settings.perHundredProtein),
    maxFat: grow(settings.maxFat, settings.perHundredFat),
    maxCarbs: grow(settings.maxCarbs, settings.perHundredCarbs),
  }
}

export function computeDayBoundsStatus(
  settings: BoundsInput,
  eaten: { kcal: number; protein: number; fat: number; carbs: number },
  activityKcal: number,
): DayBoundsStatus {
  const max = effectiveMaxBounds(settings, activityKcal)
  return {
    kcal: nutrientBoundStatus(eaten.kcal, settings.minKcal, max.maxKcal),
    protein: nutrientBoundStatus(eaten.protein, settings.minProtein, max.maxProtein),
    fat: nutrientBoundStatus(eaten.fat, settings.minFat, max.maxFat),
    carbs: nutrientBoundStatus(eaten.carbs, settings.minCarbs, max.maxCarbs),
  }
}

/**
 * Цвет цифры дня — одно правило для дневника и статистики (владелица,
 * 2026-09-29): по каждому из ккал/Б/Ж/У отдельно. Есть хоть одна граница
 * по этому нутриенту — по границам (недобор / внутри / перебор); границ
 * нет, но есть цель — перебор, если съела больше цели, иначе «внутри»
 * (недобора по одной цели не бывает); нет ни того, ни другого — `null`
 * (серый). Цель передаём в том виде, в каком её видно на экране
 * (округлённой), чтобы «150.0/150» не краснело из-за 149,6 под капотом.
 */
export function computeDayStatus(
  settings: BoundsInput | null,
  eaten: { kcal: number; protein: number; fat: number; carbs: number },
  activityKcal: number,
  goal: { kcal: number; protein: number; fat: number; carbs: number } | null,
): DayBoundsStatus {
  const bounds = settings ? computeDayBoundsStatus(settings, eaten, activityKcal) : null
  const pick = (key: keyof DayBoundsStatus): BoundStatus | null => {
    const byBounds = bounds?.[key] ?? null
    if (byBounds) return byBounds
    if (goal) return eaten[key] > goal[key] ? 'over' : 'ok'
    return null
  }
  return { kcal: pick('kcal'), protein: pick('protein'), fat: pick('fat'), carbs: pick('carbs') }
}
