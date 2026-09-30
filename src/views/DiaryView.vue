<script setup lang="ts">
import { Calendar, Search, Settings } from '@lucide/vue'
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
import { byCreatedAt, bySnackPosition, cleanupEmptySnacksForDate, type Meal } from '../lib/diary'
import { db } from '../lib/db'
import {
  dayGoalWithPlan,
  displayDayStatus,
  computeDayGoal,
  pickGoalSettingsForDate,
  dayActivity as computeDayActivity,
  type DayTypeKind,
} from '../lib/goals'
import { scaleByGrams, sumMacros } from '../lib/nutrition'
import { statusTextClass } from '../lib/statusColors'
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

// Цвет цифр в плашке — общее правило с статистикой (goals.ts →
// computeDayStatus): по границам, если заданы; иначе по цели; иначе серый.
// Границы берём из currentGoalSettings напрямую (4.5: «можно и с целями,
// и без них»); активность — для галочки «верхние растут с активностью».
const dayStatus = computed(() =>
  displayDayStatus(currentGoalSettings.value, dayTotals.value, dayActivity.value, dayGoal.value),
)
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
const snacksByMeal = computed(() => ({
  breakfast: daySnacks.value.filter((s) => s.after === 'breakfast').sort(bySnackPosition),
  lunch: daySnacks.value.filter((s) => s.after === 'lunch').sort(bySnackPosition),
  dinner: daySnacks.value.filter((s) => s.after === 'dinner').sort(bySnackPosition),
}))
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
  <div class="fixed top-0 inset-x-0 z-30 h-[env(safe-area-inset-top)] bg-bg" />
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
         Независимые отметки: план влияет на ориентир ниже, факт — только
         метка (в общую статистику пойдёт, когда она появится в этапе 6). -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-muted w-9 shrink-0">План</span>
        <div class="flex gap-1 text-xs flex-1">
          <button type="button" @click="pickPlan(null)" class="flex-1 py-1.5 rounded-xl" :class="!dayType?.planned ? 'bg-accent text-white' : 'bg-card border border-line text-muted'">
            Обычный
          </button>
          <button
            type="button"
            :disabled="!activityGoal"
            @click="pickPlan('high')"
            class="flex-1 py-1.5 rounded-xl disabled:opacity-40"
            :class="dayType?.planned === 'high' ? 'bg-accent text-white' : 'bg-card border border-line text-muted'"
          >
            Высокоугл.
          </button>
          <button
            type="button"
            :disabled="!activityGoal"
            @click="pickPlan('low')"
            class="flex-1 py-1.5 rounded-xl disabled:opacity-40"
            :class="dayType?.planned === 'low' ? 'bg-accent text-white' : 'bg-card border border-line text-muted'"
          >
            Низкоугл.
          </button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-muted w-9 shrink-0">Факт</span>
        <div class="flex gap-1 text-xs flex-1">
          <button type="button" @click="pickFact(null)" class="flex-1 py-1.5 rounded-xl" :class="!dayType?.actual ? 'bg-accent text-white' : 'bg-card border border-line text-muted'">
            Обычный
          </button>
          <button type="button" @click="pickFact('high')" class="flex-1 py-1.5 rounded-xl" :class="dayType?.actual === 'high' ? 'bg-accent text-white' : 'bg-card border border-line text-muted'">
            Высокоугл.
          </button>
          <button type="button" @click="pickFact('low')" class="flex-1 py-1.5 rounded-xl" :class="dayType?.actual === 'low' ? 'bg-accent text-white' : 'bg-card border border-line text-muted'">
            Низкоугл.
          </button>
        </div>
      </div>
    </div>

    <!-- Итоги дня прилипают к верху при прокрутке (владелица); под ними
         липнет шапка раскрытого приёма — её отступ берёт высоту отсюда
         (--day-header-h, см. ResizeObserver выше) -->
    <div
      ref="dayHeaderEl"
      class="sticky z-20 -mx-4 px-4 -my-2 py-2 bg-bg"
      style="top: env(safe-area-inset-top)"
    >
      <div class="rounded-2xl bg-card border border-line px-4 py-3 grid grid-cols-4 text-center">
        <div v-if="activityGoal" class="col-span-4 flex justify-center mb-2">
          <div class="flex rounded-full border border-line p-0.5 text-xs">
            <button
              v-for="v in [{ k: 'fact', l: 'Факт' }, { k: 'plan', l: 'План' }] as const"
              :key="v.k"
              type="button"
              @click="goalView = v.k"
              class="px-3 py-1 rounded-full"
              :class="goalView === v.k ? 'bg-accent text-white' : 'text-muted'"
            >
              {{ v.l }}
            </button>
          </div>
        </div>
        <div>
          <p class="text-[11px] text-muted">Ж</p>
          <p class="text-sm font-semibold" :class="statusTextClass(dayStatus.fat)">
            {{ dayTotals.fat.toFixed(1) }}<template v-if="dayGoal">/{{ Math.round(dayGoal.fat) }}<span v-if="dayGoal.fatChanged">⚡</span></template>
          </p>
        </div>
        <div>
          <p class="text-[11px] text-muted">У</p>
          <p class="text-sm font-semibold" :class="statusTextClass(dayStatus.carbs)">
            {{ dayTotals.carbs.toFixed(1) }}<template v-if="dayGoal">/{{ Math.round(dayGoal.carbs) }}<span v-if="dayGoal.carbsChanged">⚡</span></template>
          </p>
        </div>
        <div>
          <p class="text-[11px] text-muted">Б</p>
          <p class="text-sm font-semibold" :class="statusTextClass(dayStatus.protein)">
            {{ dayTotals.protein.toFixed(1) }}<template v-if="dayGoal">/{{ Math.round(dayGoal.protein) }}<span v-if="dayGoal.proteinChanged">⚡</span></template>
          </p>
        </div>
        <div>
          <p class="text-[11px] text-muted">Ккал</p>
          <p class="text-sm font-semibold" :class="statusTextClass(dayStatus.kcal)">
            {{ Math.round(dayTotals.kcal) }}<template v-if="dayGoal">/{{ Math.round(dayGoal.kcal) }}</template>
          </p>
        </div>
      </div>

    </div>
    <div class="flex flex-col gap-3">
      <template v-for="meal in MEALS" :key="meal">
        <MealCard :meal="meal" :date="date" :entries="mealEntries[meal]" :day-kcal="dayTotals.kcal" />
        <SnackCard
          v-for="snack in snacksByMeal[meal]"
          :key="snack.id"
          :snack="snack"
          :entries="entriesForSnack(snack.id)"
          :day-kcal="dayTotals.kcal"
        />
      </template>
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
