<script setup lang="ts">
import { ChevronDown, Plus, Sun, Sunrise, Sunset } from '@lucide/vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Entry } from '../lib/db'
import { MEAL_LABELS, softDeleteEntry } from '../lib/diary'
import { scaleByGrams, sumMacros } from '../lib/nutrition'
import GramsEditSheet from './GramsEditSheet.vue'

const props = defineProps<{
  meal: 'breakfast' | 'lunch' | 'dinner'
  date: string
  entries: Entry[] // уже отфильтрованы и отсортированы по этому приёму
  dayKcal: number // для доли «26%» — сумма ккал за весь день
}>()

const MEAL_ICON = { breakfast: Sunrise, lunch: Sun, dinner: Sunset }
const SWIPE_THRESHOLD = 80

const expanded = ref(false)
const editingEntry = ref<Entry | null>(null)

/** Entry хранит КБЖУ на 100 г (снимок) + отдельно граммы порции — сначала масштабируем. */
function entryTotal(entry: Entry) {
  return scaleByGrams(entry, entry.grams)
}

const totals = computed(() => sumMacros(props.entries.map(entryTotal)))
const sharePercent = computed(() =>
  props.dayKcal > 0 ? Math.round((totals.value.kcal / props.dayKcal) * 100) : 0,
)

function deleteEntry(entry: Entry) {
  void softDeleteEntry(entry.id)
}

// Свайп на строке — одно поле состояния на карточку, привязка по id, а не
// замыкание на элемент: список сам может перерисоваться посреди жеста
// (например, докатился фоновый синк), и тогда замыкание, созданное на
// момент touchstart, было бы уже не тем, что получит touchend.
const swipeStart = ref<{ id: string; x: number; y: number } | null>(null)

function onTouchStart(e: TouchEvent, id: string) {
  const t = e.touches[0]
  if (!t) return
  swipeStart.value = { id, x: t.clientX, y: t.clientY }
}

function onTouchMove(e: TouchEvent) {
  const start = swipeStart.value
  const t = e.touches[0]
  if (!start || !t) return
  if (Math.abs(t.clientX - start.x) > Math.abs(t.clientY - start.y)) e.preventDefault()
}

function onTouchEnd(e: TouchEvent, entry: Entry) {
  const start = swipeStart.value
  swipeStart.value = null
  if (!start || start.id !== entry.id) return
  const t = e.changedTouches[0]
  if (!t) return
  const dx = t.clientX - start.x
  const dy = t.clientY - start.y
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return
  deleteEntry(entry)
}
</script>

<template>
  <section class="rounded-2xl bg-card border border-line overflow-hidden">
    <div class="flex items-center gap-2 px-4 pt-3">
      <component :is="MEAL_ICON[meal]" :size="16" class="text-accent shrink-0" />
      <h3 class="text-sm font-semibold text-ink flex-1">{{ MEAL_LABELS[meal] }}</h3>
      <span class="text-sm text-muted">{{ Math.round(totals.kcal) }} ккал</span>
      <RouterLink
        :to="`/day/${date}/add/${meal}`"
        aria-label="Добавить"
        class="w-7 h-7 rounded-full flex items-center justify-center text-accent"
      >
        <Plus :size="18" />
      </RouterLink>
    </div>

    <button
      type="button"
      @click="expanded = !expanded"
      class="w-full flex items-center gap-3 px-4 py-2.5 text-left"
    >
      <span class="text-xs text-muted flex-1">
        <template v-if="entries.length">
          {{ totals.protein.toFixed(1) }} · {{ totals.fat.toFixed(1) }} · {{ totals.carbs.toFixed(1) }} ·
          {{ sharePercent }}%
        </template>
        <template v-else>Пусто</template>
      </span>
      <ChevronDown :size="16" class="text-muted transition-transform" :class="expanded ? 'rotate-180' : ''" />
    </button>

    <ul v-if="expanded" class="border-t border-line">
      <li v-if="entries.length === 0" class="px-4 py-3 text-sm text-muted">Ничего не добавлено</li>
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="flex items-center gap-3 px-4 py-2.5 border-t border-line first:border-t-0 active:bg-bg"
        role="button"
        tabindex="0"
        @click="editingEntry = entry"
        @touchstart="onTouchStart($event, entry.id)"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd($event, entry)"
      >
        <span class="flex-1 text-sm text-ink truncate">{{ entry.name }}</span>
        <span class="text-xs text-muted shrink-0">{{ entry.grams }} г</span>
        <span class="text-xs text-muted shrink-0 w-12 text-right">
          {{ Math.round(entryTotal(entry).kcal) }} ккал
        </span>
      </li>
    </ul>

    <GramsEditSheet v-if="editingEntry" :entry="editingEntry" @close="editingEntry = null" />
  </section>
</template>
