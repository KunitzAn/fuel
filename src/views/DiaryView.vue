<script setup lang="ts">
import { Calendar, Search, Settings } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import DayPickerSheet from '../components/DayPickerSheet.vue'
import MealCard from '../components/MealCard.vue'
import SnackCard from '../components/SnackCard.vue'
import WeekStrip from '../components/WeekStrip.vue'
import { capitalizeFirst, formatDateWithWeekday, todayLocalDate, weekDates } from '../lib/date'
import { byCreatedAt, bySnackPosition, cleanupEmptySnacksForDate, type Meal } from '../lib/diary'
import { db } from '../lib/db'
import { scaleByGrams, sumMacros } from '../lib/nutrition'
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

const dayEntries = computed(() => allEntries.value.filter((e) => e.date === date.value).sort(byCreatedAt))
const dayTotals = computed(() =>
  sumMacros(dayEntries.value.map((e) => scaleByGrams(e, e.grams))),
)

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
  <main class="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-24 flex flex-col gap-4">
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

    <div class="rounded-2xl bg-card border border-line px-4 py-3 grid grid-cols-4 text-center">
      <div>
        <p class="text-[11px] text-muted">Б</p>
        <p class="text-sm font-semibold text-ink">{{ dayTotals.protein.toFixed(1) }}</p>
      </div>
      <div>
        <p class="text-[11px] text-muted">Ж</p>
        <p class="text-sm font-semibold text-ink">{{ dayTotals.fat.toFixed(1) }}</p>
      </div>
      <div>
        <p class="text-[11px] text-muted">У</p>
        <p class="text-sm font-semibold text-ink">{{ dayTotals.carbs.toFixed(1) }}</p>
      </div>
      <div>
        <p class="text-[11px] text-muted">Ккал</p>
        <p class="text-sm font-semibold text-ink">{{ Math.round(dayTotals.kcal) }}</p>
      </div>
    </div>
    <!-- Цель («123/120», ⚡) появится в этапе 4 — пока показываем только факт -->

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
    </div>
    <!-- Карточка энергии — этап 4 -->

    <DayPickerSheet v-if="pickingDay" @close="pickingDay = false" @pick="pickDay" />
  </main>
</template>
