<script setup lang="ts">
// Прыжок на произвольный день (📅 в шапке дневника). В отличие от daylens,
// будущие дни не блокируем — README прямо разрешает ходить и туда.
import { computed, ref } from 'vue'
import { capitalizeFirst, formatDateWithWeekday, shiftDate, todayLocalDate } from '../lib/date'

const emit = defineEmits<{ close: []; pick: [date: string] }>()

const today = todayLocalDate()
const chosen = ref('')

const quickDays = computed(() => [
  { date: shiftDate(today, -1), label: 'Вчера' },
  { date: today, label: 'Сегодня' },
  { date: shiftDate(today, 1), label: 'Завтра' },
])

function pickChosen() {
  if (!chosen.value) return
  emit('pick', chosen.value)
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="relative w-full max-w-md rounded-t-3xl bg-bg px-4 pt-5 pb-8 flex flex-col gap-3">
      <h2 class="text-base font-semibold text-ink">За какой день?</h2>

      <button
        v-for="day in quickDays"
        :key="day.date"
        type="button"
        @click="emit('pick', day.date)"
        class="rounded-2xl bg-card border border-line px-4 py-3 flex items-center justify-between gap-3 text-left"
      >
        <span class="text-sm font-medium text-ink">{{ day.label }}</span>
        <span class="text-xs text-muted">{{ capitalizeFirst(formatDateWithWeekday(day.date)) }}</span>
      </button>

      <label class="rounded-2xl bg-card border border-line px-4 py-3 flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-ink">Другой день</span>
        <input
          v-model="chosen"
          type="date"
          @change="pickChosen"
          class="text-sm text-ink bg-transparent outline-none"
        />
      </label>

      <button type="button" @click="emit('close')" class="rounded-2xl py-3 text-sm text-muted">
        Отмена
      </button>
    </div>
  </div>
</template>
