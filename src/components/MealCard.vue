<script setup lang="ts">
import { ChevronDown, Plus, Sun, Sunrise, Sunset } from '@lucide/vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EntryList from './EntryList.vue'
import type { Entry } from '../lib/db'
import { createSnack, MEAL_GENITIVE, MEAL_LABELS, type Meal } from '../lib/diary'
import { scaleByGrams, sumMacros } from '../lib/nutrition'

const props = defineProps<{
  meal: Meal
  date: string
  entries: Entry[] // уже отфильтрованы и отсортированы по этому приёму
  dayKcal: number // для доли «26%» — сумма ккал за весь день
}>()

const MEAL_ICON = { breakfast: Sunrise, lunch: Sun, dinner: Sunset }
// Этап 8: у каждого приёма свой цвет — пятно в углу, иконка, «+»
const MEAL_COLOR = { breakfast: 'var(--breakfast)', lunch: 'var(--lunch)', dinner: 'var(--dinner)' }

const expanded = ref(false)

const totals = computed(() => sumMacros(props.entries.map((e) => scaleByGrams(e, e.grams))))
const sharePercent = computed(() =>
  props.dayKcal > 0 ? Math.round((totals.value.kcal / props.dayKcal) * 100) : 0,
)

function addSnack() {
  void createSnack(props.date, props.meal)
  expanded.value = true // сразу видно новую карточку перекуса под этой
}
</script>

<template>
  <!-- overflow-clip, а не hidden: hidden делает карточку контейнером
       прокрутки, и прилипающая шапка ниже перестала бы липнуть к экрану -->
  <section class="rounded-3xl glass glow overflow-clip" :style="{ '--glow': MEAL_COLOR[meal], '--card-color': MEAL_COLOR[meal] }">
    <!-- Раскрытый приём прилипает шапкой под итогами дня, пока его список
         на экране (владелица: «если в нём много продуктов») -->
    <div
      :class="expanded ? 'sticky z-10 bg-card-solid glow border-b border-line' : ''"
      style="top: calc(env(safe-area-inset-top) + var(--day-header-h, 0px))"
    >
      <div class="flex items-center gap-2 px-4 pt-3">
        <span class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-(--card-color)/15">
          <component :is="MEAL_ICON[meal]" :size="16" class="text-(--card-color)" />
        </span>
        <h3 class="text-sm font-semibold text-ink flex-1">{{ MEAL_LABELS[meal] }}</h3>
        <span class="text-sm text-muted">{{ Math.round(totals.kcal) }} ккал</span>
        <RouterLink
          :to="`/day/${date}/add/${meal}`"
          aria-label="Добавить"
          class="w-7 h-7 rounded-full flex items-center justify-center text-(--card-color)"
        >
          <Plus :size="18" />
        </RouterLink>
      </div>

      <button
        type="button"
        @click="expanded = !expanded"
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left"
      >
        <!-- Ж · У · Б · доля ккал дня — крупно, как в FatSecret (владелица);
             порядок Ж У Б — её привычный -->
        <span v-if="entries.length" class="flex-1 grid grid-cols-4 text-[15px] text-ink tabular-nums">
          <span>{{ totals.fat.toFixed(1) }}</span>
          <span>{{ totals.carbs.toFixed(1) }}</span>
          <span>{{ totals.protein.toFixed(1) }}</span>
          <span>{{ sharePercent }}%</span>
        </span>
        <span v-else class="text-xs text-muted flex-1">Пусто</span>
        <ChevronDown :size="16" class="text-muted transition-transform" :class="expanded ? 'rotate-180' : ''" />
      </button>
    </div>

    <template v-if="expanded">
      <div class="border-t border-line">
        <EntryList :entries="entries" />
      </div>
      <button
        type="button"
        @click="addSnack"
        class="w-full text-left px-4 py-2.5 text-sm text-(--card-color) border-t border-line"
      >
        + перекус после {{ MEAL_GENITIVE[meal] }}
      </button>
    </template>
  </section>
</template>
