<script setup lang="ts">
import { Calendar, ChevronDown, Plus, Search, Settings } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import DayPickerSheet from '../components/DayPickerSheet.vue'
import DayTypePickerSheet from '../components/DayTypePickerSheet.vue'
import EnergyCard from '../components/EnergyCard.vue'
import MealCard from '../components/MealCard.vue'
import SnackCard from '../components/SnackCard.vue'
import WeekStrip from '../components/WeekStrip.vue'
import { capitalizeFirst, formatDateWithWeekday, todayLocalDate, weekDates } from '../lib/date'
import { setActualDayType, setPlannedDayType, type DayTypePlan } from '../lib/dayTypes'
import {
  byCreatedAt,
  bySnackPosition,
  cleanupEmptySnacksForDate,
  createSnack,
  moveSnack,
  type Meal,
  type SnackSlot,
} from '../lib/diary'
import { db, type Snack } from '../lib/db'
import {
  dayGoalWithPlan,
  effectiveMaxBounds,
  computeDayGoal,
  pickGoalSettingsForDate,
  dayActivity as computeDayActivity,
  type DayTypeKind,
} from '../lib/goals'
import { scaleByGrams, sumMacros } from '../lib/nutrition'
import { TREAT_LABEL_PLURAL, TreatIcon } from '../lib/treat'
import { useLiveQuery } from '../lib/useLiveQuery'

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner']

const route = useRoute()
const router = useRouter()

const date = computed(() => (route.params.date as string) || todayLocalDate())
const today = todayLocalDate()

// Загружаем весь дневник живым запросом один раз (как в daylens) и
// фильтруем по дню/приёму реактивным computed — так смена даты не требует
// пересоздавать Dexie-подписку на каждый свайп/тап по неделе.
const allEntries = useLiveQuery(() => db.entries.filter((e) => e.deletedAt === null).toArray(), [])
const allSnacks = useLiveQuery(() => db.snacks.filter((s) => s.deletedAt === null).toArray(), [])
const allActivities = useLiveQuery(() => db.activities.filter((a) => a.deletedAt === null).toArray(), [])
const allGoalSettings = useLiveQuery(() => db.goalSettings.filter((g) => g.deletedAt === null).toArray(), [])
// Этап 5: активная энергия за день из Здоровья — в «потрачено», не в прибавку к цели (goals.ts → dayActivity).
const allDailyActiveEnergy = useLiveQuery(() => db.dailyActiveEnergy.filter((r) => r.deletedAt === null).toArray(), [])
const allDayTypes = useLiveQuery(() => db.dayTypes.filter((d) => d.deletedAt === null).toArray(), [])

// Версия настроек этого конкретного дня — не «сегодня» (README «История
// настроек целей»): прошлый день должен считаться по цифрам, которые были
// действующими тогда, даже если настройки потом поменяли.
const dayActivities = computed(() => allActivities.value.filter((a) => a.date === date.value))
const dayDailyActiveEnergy = computed(() => allDailyActiveEnergy.value.find((r) => r.date === date.value) ?? null)
const currentGoalSettings = computed(() => pickGoalSettingsForDate(allGoalSettings.value, date.value))
const dayActivity = computed(() => computeDayActivity(dayActivities.value, dayDailyActiveEnergy.value))
const activityGoal = computed(() =>
  currentGoalSettings.value ? computeDayGoal(currentGoalSettings.value, dayActivity.value) : null,
)

// Тип дня (этап 4.4, не из README): план — снимок поправки на момент
// простановки, не пересчитывается сам (см. db/schema.ts). Складывается с
// activityGoal независимо от активности.
const dayType = computed(() => allDayTypes.value.find((d) => d.date === date.value) ?? null)
const dayTypeOpen = ref(false)
const DAY_TYPE_LABEL = { normal: 'обычный', high: 'высокоугл.', low: 'низкоугл.' } as const
// Переключатель в шапке (владелица, после этапа 6): «Факт» — цель с
// прибавкой за тренировки/ручную активность; «План» — цель с поправкой
// запланированного типа дня, без прибавки за активность. Цифры «/цель» и
// цвет — по выбранному. «Потрачено» в карточке энергии — всегда факт.
// Выбор помним на этом устройстве (просто удобство, не данные).
const GOAL_VIEW_KEY = 'diaryGoalView'
function readGoalView(): 'fact' | 'plan' {
  try {
    return localStorage.getItem(GOAL_VIEW_KEY) === 'plan' ? 'plan' : 'fact'
  } catch {
    return 'fact'
  }
}
const goalView = ref<'fact' | 'plan'>(readGoalView())
watch(goalView, (v) => {
  try {
    localStorage.setItem(GOAL_VIEW_KEY, v)
  } catch {
    // приватный режим — просто не запомним
  }
})
const planGoal = computed(() =>
  currentGoalSettings.value ? dayGoalWithPlan(computeDayGoal(currentGoalSettings.value, 0), dayType.value) : null,
)
const dayGoal = computed(() => (goalView.value === 'plan' ? planGoal.value : activityGoal.value))

const pickingDayTypeKind = ref<DayTypeKind | null>(null)
function pickPlan(kind: DayTypeKind | null) {
  if (kind === null) {
    void setPlannedDayType(date.value, null)
    return
  }
  if (!activityGoal.value) return // без базовых целей поправку не из чего считать
  pickingDayTypeKind.value = kind
}
function onDayTypePicked(plan: DayTypePlan) {
  pickingDayTypeKind.value = null
  void setPlannedDayType(date.value, plan)
}
function pickFact(kind: DayTypeKind | null) {
  void setActualDayType(date.value, kind)
}

const dayEntries = computed(() => allEntries.value.filter((e) => e.date === date.value).sort(byCreatedAt))
const dayTotals = computed(() =>
  sumMacros(dayEntries.value.map((e) => scaleByGrams(e, e.grams))),
)
const dayTreat = computed(() =>
  sumMacros(dayEntries.value.filter((e) => e.treat === true).map((e) => scaleByGrams(e, e.grams))),
)

// Итоги дня (этап 8): цифра и шкала — всегда в цвете нутриента (владелица
// отказалась от цветов недобора/перебора). Шкала — доля от цели; целей нет
// — от верхней/нижней границы. Мин/макс границы (4.5) теперь видны
// отметками на шкале, раз цветом их больше не подсвечиваем.
type MacroKey = 'fat' | 'carbs' | 'protein' | 'kcal'
const MACRO_CELLS: { key: MacroKey; label: string; color: string; digits: number }[] = [
  { key: 'fat', label: 'Ж', color: 'var(--fat)', digits: 1 },
  { key: 'carbs', label: 'У', color: 'var(--carbs)', digits: 1 },
  { key: 'protein', label: 'Б', color: 'var(--protein)', digits: 1 },
  { key: 'kcal', label: 'Ккал', color: 'var(--kcal)', digits: 0 },
]
const BOUND_KEYS: Record<MacroKey, { min: 'minFat' | 'minCarbs' | 'minProtein' | 'minKcal'; max: 'maxFat' | 'maxCarbs' | 'maxProtein' | 'maxKcal' }> = {
  fat: { min: 'minFat', max: 'maxFat' },
  carbs: { min: 'minCarbs', max: 'maxCarbs' },
  protein: { min: 'minProtein', max: 'maxProtein' },
  kcal: { min: 'minKcal', max: 'maxKcal' },
}
const macroCells = computed(() => {
  const s = currentGoalSettings.value
  const maxes = s ? effectiveMaxBounds(s, dayActivity.value) : null
  return MACRO_CELLS.map((c) => {
    const value = dayTotals.value[c.key]
    const goal = dayGoal.value ? dayGoal.value[c.key] : null
    const min = s?.[BOUND_KEYS[c.key].min] ?? null
    const max = maxes?.[BOUND_KEYS[c.key].max] ?? null
    const scale = goal ?? max ?? min
    const pct = (v: number | null) => (v === null || !scale ? null : Math.min(100, (v / scale) * 100))
    const changed =
      dayGoal.value && c.key !== 'kcal' ? dayGoal.value[`${c.key}Changed` as 'fatChanged' | 'carbsChanged' | 'proteinChanged'] : false
    return {
      ...c,
      // от 100 — без десятых: четыре числа с целью должны влезть в строку
      value: c.digits && value < 100 ? value.toFixed(c.digits) : String(Math.round(value)),
      goal: goal === null ? null : Math.round(goal),
      changed,
      fill: pct(value),
      ticks: [pct(min), pct(max)].filter((t): t is number => t !== null && t < 100),
    }
  })
})
// Высота прилипшей плашки итогов — отступ для прилипающей шапки приёма
const dayHeaderEl = ref<HTMLElement | null>(null)
const dayHeaderHeight = ref(0)
let headerObserver: ResizeObserver | null = null
onMounted(() => {
  headerObserver = new ResizeObserver(() => {
    dayHeaderHeight.value = dayHeaderEl.value?.offsetHeight ?? 0
  })
  if (dayHeaderEl.value) headerObserver.observe(dayHeaderEl.value)
})
onBeforeUnmount(() => headerObserver?.disconnect())

const mealEntries = computed(() => ({
  breakfast: dayEntries.value.filter((e) => e.meal === 'breakfast'),
  lunch: dayEntries.value.filter((e) => e.meal === 'lunch'),
  dinner: dayEntries.value.filter((e) => e.meal === 'dinner'),
}))

const daySnacks = computed(() => allSnacks.value.filter((s) => s.date === date.value))
// Карточки дня по порядку: перекусы выше завтрака, завтрак, его перекусы,
// обед, … ужин, его перекусы. Плоский список — по нему считается, куда
// встанет перетаскиваемый перекус
type Block = { key: string; kind: 'meal'; meal: Meal } | { key: string; kind: 'snack'; snack: Snack }
const blocks = computed<Block[]>(() => {
  const out: Block[] = []
  const pushSnacks = (slot: SnackSlot) => {
    for (const snack of daySnacks.value.filter((s) => s.after === slot).sort(bySnackPosition)) {
      out.push({ key: `snack:${snack.id}`, kind: 'snack', snack })
    }
  }
  pushSnacks('start')
  for (const meal of MEALS) {
    out.push({ key: `meal:${meal}`, kind: 'meal', meal })
    pushSnacks(meal)
  }
  return out
})

// «+ Перекус» под приёмами (владелица, 04.10: не изнутри приёма) — в конец
// дня; потом его можно зажать и перетащить выше любого приёма
function addSnack() {
  void createSnack(date.value)
}

// Перетаскивание перекуса: SnackCard ловит долгое нажатие и зовёт сюда,
// дальше палец ведём по окну. Карточка едет за пальцем, полоска
// показывает, куда встанет; у краёв экрана страница сама прокручивается.
const blocksEl = ref<HTMLElement | null>(null)
interface SnackDrag {
  id: string
  startY: number
  startScroll: number
  y: number
  scroll: number
  /** Перед какой карточкой встанет; null — в самый конец. */
  dropBefore: string | null
}
const snackDrag = ref<SnackDrag | null>(null)
let scrollFrame = 0

function snackDragOffset(id: string): number | null {
  const d = snackDrag.value
  return d && d.id === id ? d.y - d.startY + (d.scroll - d.startScroll) : null
}

function updateDrop() {
  const d = snackDrag.value
  if (!d || !blocksEl.value) return
  const others = [...blocksEl.value.querySelectorAll<HTMLElement>('[data-block]')].filter(
    (el) => el.dataset.block !== `snack:${d.id}`,
  )
  const next = others.find((el) => {
    const r = el.getBoundingClientRect()
    return d.y < r.top + r.height / 2
  })
  d.dropBefore = next?.dataset.block ?? null
}

// Полоска не нужна, если перекус встанет туда же, где стоит
const dropIndicator = computed(() => {
  const d = snackDrag.value
  if (!d) return undefined
  const list = blocks.value
  const i = list.findIndex((b) => b.key === `snack:${d.id}`)
  const current = list[i + 1]?.key ?? null
  return d.dropBefore === current ? undefined : d.dropBefore
})

function autoScroll() {
  const d = snackDrag.value
  if (!d) return
  const top = (dayHeaderEl.value?.getBoundingClientRect().bottom ?? 0) + 60
  const bottom = window.innerHeight - 140 // таб-бар
  const speed = d.y < top ? -Math.min(14, (top - d.y) / 4) : d.y > bottom ? Math.min(14, (d.y - bottom) / 4) : 0
  if (speed) {
    window.scrollBy(0, speed)
    d.scroll = window.scrollY
    updateDrop()
  }
  scrollFrame = requestAnimationFrame(autoScroll)
}

function onSnackDragMove(e: TouchEvent) {
  const d = snackDrag.value
  const t = e.touches[0]
  if (!d || !t) return
  e.preventDefault()
  d.y = t.clientY
  updateDrop()
}

function stopSnackDrag() {
  cancelAnimationFrame(scrollFrame)
  window.removeEventListener('touchmove', onSnackDragMove)
  window.removeEventListener('touchend', dropSnack)
  window.removeEventListener('touchcancel', stopSnackDrag)
  snackDrag.value = null
}

function startSnackDrag(id: string, y: number) {
  stopSnackDrag()
  snackDrag.value = { id, startY: y, startScroll: window.scrollY, y, scroll: window.scrollY, dropBefore: null }
  updateDrop()
  window.addEventListener('touchmove', onSnackDragMove, { passive: false })
  window.addEventListener('touchend', dropSnack)
  window.addEventListener('touchcancel', stopSnackDrag)
  scrollFrame = requestAnimationFrame(autoScroll)
}

function dropSnack() {
  const d = snackDrag.value
  const target = dropIndicator.value
  stopSnackDrag()
  if (!d || target === undefined) return
  const list = blocks.value.filter((b) => b.key !== `snack:${d.id}`)
  let at = target === null ? list.length : list.findIndex((b) => b.key === target)
  if (at < 0) at = list.length
  // Место — последний приём выше точки вставки (нет такого — выше завтрака);
  // порядок — перекусы этого места до точки, перенесённый, после точки
  let slot: SnackSlot = 'start'
  let slotStart = 0
  list.slice(0, at).forEach((b, i) => {
    if (b.kind === 'meal') {
      slot = b.meal
      slotStart = i + 1
    }
  })
  const snackIds = (part: Block[]) => part.flatMap((b) => (b.kind === 'snack' ? [b.snack.id] : []))
  const tail = list.slice(at)
  const firstMeal = tail.findIndex((b) => b.kind === 'meal')
  const ordered = [
    ...snackIds(list.slice(slotStart, at)),
    d.id,
    ...snackIds(firstMeal === -1 ? tail : tail.slice(0, firstMeal)),
  ]
  void moveSnack(d.id, slot, ordered)
}
onBeforeUnmount(stopSnackDrag)
function entriesForSnack(snackId: string) {
  return dayEntries.value.filter((e) => e.snackId === snackId)
}

const datesWithEntries = computed(() => {
  const week = new Set(weekDates(date.value))
  return new Set(allEntries.value.filter((e) => week.has(e.date)).map((e) => e.date))
})

const headerTitle = computed(() =>
  date.value === today ? 'Сегодня' : capitalizeFirst(formatDateWithWeekday(date.value)),
)

function selectDate(d: string) {
  void router.replace(`/day/${d}`)
}

const pickingDay = ref(false)
function pickDay(d: string) {
  pickingDay.value = false
  selectDate(d)
}

// «Пустой перекус исчезает, когда уходишь с экрана» (README) — чистим день,
// который покидаем: и при смене даты (свайп/календарь), и при уходе с
// дневника вовсе. Уход на добавление еды в этот же перекус — тоже formально
// уход с маршрута, но снести перекус раньше, чем в него успели что-то
// положить, было бы просто багом, поэтому туда — без очистки.
watch(date, (_, previousDate) => {
  if (previousDate) void cleanupEmptySnacksForDate(previousDate)
})
onBeforeRouteLeave((to) => {
  if (to.name === 'add-food' || to.name === 'add-food-snack') return
  void cleanupEmptySnacksForDate(date.value)
})
</script>

<template>
  <!-- Под статус-баром iPhone прилипшие плашки не должны просвечивать -->
  <div class="fixed top-0 inset-x-0 z-30 h-[env(safe-area-inset-top)] bg-bg/70 backdrop-blur-xl" />
  <main
    class="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-24 flex flex-col gap-4"
    :style="{ '--day-header-h': `${dayHeaderHeight}px` }"
  >
    <header class="flex items-center justify-between">
      <!-- 🔍 — назначение на главном экране в README не расписано отдельно
           от поиска внутри добавления еды; пока заглушка, см. PLAN.md -->
      <button type="button" disabled class="w-9 h-9 flex items-center justify-center text-muted/50">
        <Search :size="18" />
      </button>
      <h1 class="text-lg font-bold text-ink">{{ headerTitle }}</h1>
      <div class="flex items-center gap-1">
        <button
          type="button"
          aria-label="Выбрать день"
          @click="pickingDay = true"
          class="w-9 h-9 flex items-center justify-center text-ink"
        >
          <Calendar :size="18" />
        </button>
        <RouterLink to="/settings" class="w-9 h-9 flex items-center justify-center text-ink">
          <Settings :size="18" />
        </RouterLink>
      </div>
    </header>

    <WeekStrip :date="date" :dates-with-entries="datesWithEntries" @select="selectDate" />

    <!-- Тип дня (этап 4.4, не из README) — план с утра, факт в конце.
         Свёрнут по умолчанию (владелица): в заголовке — что выбрано,
         тап разворачивает чипы. -->
    <div class="flex flex-col gap-1.5">
      <button type="button" @click="dayTypeOpen = !dayTypeOpen" class="flex items-center gap-2 text-xs text-muted">
        <span>Тип дня:</span>
        <span class="text-ink">План — {{ DAY_TYPE_LABEL[dayType?.planned ?? 'normal'] }} · Факт — {{ DAY_TYPE_LABEL[dayType?.actual ?? 'normal'] }}</span>
        <ChevronDown :size="14" class="ml-auto transition-transform" :class="dayTypeOpen ? 'rotate-180' : ''" />
      </button>
      <template v-if="dayTypeOpen">
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-muted w-9 shrink-0">План</span>
          <div class="flex gap-1 text-xs flex-1">
            <button type="button" @click="pickPlan(null)" class="flex-1 py-1.5 rounded-xl" :class="!dayType?.planned ? 'bg-accent text-white' : 'glass text-muted'">
              Обычный
            </button>
            <button
              type="button"
              :disabled="!activityGoal"
              @click="pickPlan('high')"
              class="flex-1 py-1.5 rounded-xl disabled:opacity-40"
              :class="dayType?.planned === 'high' ? 'bg-accent text-white' : 'glass text-muted'"
            >
              Высокоугл.
            </button>
            <button
              type="button"
              :disabled="!activityGoal"
              @click="pickPlan('low')"
              class="flex-1 py-1.5 rounded-xl disabled:opacity-40"
              :class="dayType?.planned === 'low' ? 'bg-accent text-white' : 'glass text-muted'"
            >
              Низкоугл.
            </button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-muted w-9 shrink-0">Факт</span>
          <div class="flex gap-1 text-xs flex-1">
            <button type="button" @click="pickFact(null)" class="flex-1 py-1.5 rounded-xl" :class="!dayType?.actual ? 'bg-accent/45 text-ink' : 'glass text-muted'">
              Обычный
            </button>
            <button type="button" @click="pickFact('high')" class="flex-1 py-1.5 rounded-xl" :class="dayType?.actual === 'high' ? 'bg-accent/45 text-ink' : 'glass text-muted'">
              Высокоугл.
            </button>
            <button type="button" @click="pickFact('low')" class="flex-1 py-1.5 rounded-xl" :class="dayType?.actual === 'low' ? 'bg-accent/45 text-ink' : 'glass text-muted'">
              Низкоугл.
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Итоги дня прилипают к верху при прокрутке (владелица); под ними
         липнет шапка раскрытого приёма — её отступ берёт высоту отсюда
         (--day-header-h, см. ResizeObserver выше) -->
    <div
      ref="dayHeaderEl"
      class="sticky z-20 -mx-4 px-4 -my-2 py-2"
      style="top: env(safe-area-inset-top)"
    >
      <div class="rounded-3xl glass glow-tr px-4 pt-3 pb-3.5 grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-x-2.5"
        style="--glow: var(--kcal); background-color: color-mix(in srgb, var(--card-solid) 88%, transparent)"
      >
        <div v-if="activityGoal" class="col-span-4 flex justify-center mb-2.5">
          <div class="flex rounded-full glass p-0.5 text-xs">
            <button
              v-for="v in [{ k: 'fact', l: 'Факт', c: 'var(--breakfast)' }, { k: 'plan', l: 'План', c: 'var(--kcal)' }] as const"
              :key="v.k"
              type="button"
              @click="goalView = v.k"
              class="px-3.5 py-1 rounded-full font-medium"
              :style="goalView === v.k ? { backgroundColor: v.c, color: 'white' } : { color: v.c }"
            >
              {{ v.l }}
            </button>
          </div>
        </div>
        <div v-for="c in macroCells" :key="c.key" class="min-w-0">
          <p class="text-[11px] text-muted">{{ c.label }}<template v-if="c.changed"> ⚡</template></p>
          <p class="leading-tight whitespace-nowrap">
            <span class="font-bold" :class="c.key === 'kcal' ? 'text-xl' : 'text-base'" :style="{ color: c.color }">{{ c.value }}</span
            ><span v-if="c.goal !== null" class="text-[11px] text-muted">/{{ c.goal }}</span>
          </p>
          <!-- Шкала: доля от цели, отметки — мин/макс границы (4.5) -->
          <div class="relative mt-1.5 h-1.5 rounded-full" :style="{ backgroundColor: `color-mix(in srgb, ${c.color} 18%, transparent)` }">
            <div v-if="c.fill !== null" class="absolute inset-y-0 left-0 rounded-full" :style="{ width: `${c.fill}%`, backgroundColor: c.color }" />
            <div v-for="(t, i) in c.ticks" :key="i" class="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-ink/40" :style="{ left: `${t}%` }" />
          </div>
        </div>
        <!-- Сколько из съеденного — «не основная» еда (lib/treat.ts) -->
        <!-- flex + items-center: плашка и цифры на одной линии (владелица) -->
        <p v-if="dayTreat.kcal > 0" class="col-span-4 mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-treat/15 text-treat"><TreatIcon :size="12" />{{ TREAT_LABEL_PLURAL }}</span>
          <span>{{ Math.round(dayTreat.kcal) }} ккал ({{ Math.round((dayTreat.kcal / dayTotals.kcal) * 100) }}%) · Ж {{ dayTreat.fat.toFixed(1) }} · У {{ dayTreat.carbs.toFixed(1) }} · Б {{ dayTreat.protein.toFixed(1) }}</span>
        </p>
      </div>

    </div>
    <div class="flex flex-col gap-3">
      <div ref="blocksEl" class="contents">
        <div v-for="(b, i) in blocks" :key="b.key" :data-block="b.key" class="relative">
          <!-- Куда встанет перетаскиваемый перекус: полоска в зазоре между
               карточками (absolute — не двигает раскладку под пальцем) -->
          <div v-if="dropIndicator === b.key" class="absolute inset-x-3 -top-2 h-1 -translate-y-1/2 rounded-full bg-snack" />
          <div
            v-if="dropIndicator === null && i === blocks.length - 1"
            class="absolute inset-x-3 -bottom-2 h-1 translate-y-1/2 rounded-full bg-snack"
          />
          <MealCard v-if="b.kind === 'meal'" :meal="b.meal" :date="date" :entries="mealEntries[b.meal]" :day-kcal="dayTotals.kcal" />
          <SnackCard
            v-else
            :snack="b.snack"
            :entries="entriesForSnack(b.snack.id)"
            :day-kcal="dayTotals.kcal"
            :drag-offset="snackDragOffset(b.snack.id)"
            @drag-start="(y) => startSnackDrag(b.snack.id, y)"
          />
        </div>
      </div>
      <button
        type="button"
        @click="addSnack"
        class="rounded-3xl border border-dashed border-snack/50 py-3 text-sm font-medium text-snack flex items-center justify-center gap-1.5"
      >
        <Plus :size="16" />
        Перекус
      </button>
      <EnergyCard
        :date="date"
        :activities="dayActivities"
        :goal="activityGoal"
        :eaten-kcal="dayTotals.kcal"
        :daily-active-energy="dayDailyActiveEnergy"
        :health-connected="allDailyActiveEnergy.length > 0"
      />
    </div>

    <DayPickerSheet v-if="pickingDay" @close="pickingDay = false" @pick="pickDay" />
    <DayTypePickerSheet
      v-if="pickingDayTypeKind && currentGoalSettings"
      :date="date"
      :kind="pickingDayTypeKind"
      :settings="currentGoalSettings"
      :entries="allEntries"
      :day-type-rows="allDayTypes"
      @close="pickingDayTypeKind = null"
      @pick="onDayTypePicked"
    />
  </main>
</template>
