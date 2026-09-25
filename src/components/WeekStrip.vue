<script setup lang="ts">
import { computed } from 'vue'
import { shiftDate, todayLocalDate, weekDates, WEEKDAY_LABELS } from '../lib/date'
import { useSwipe } from '../lib/useSwipe'

const props = defineProps<{
  date: string
  /** Даты (YYYY-MM-DD) недели, где есть хотя бы одна не удалённая запись. */
  datesWithEntries: Set<string>
}>()

const emit = defineEmits<{ select: [date: string] }>()

const days = computed(() => weekDates(props.date))
const today = todayLocalDate()

// Соседняя неделя — тот же день недели, сдвинутый на 7: неделя вокруг него
// автоматически оказывается следующей/предыдущей.
const swipe = useSwipe(
  () => emit('select', shiftDate(props.date, 7)),
  () => emit('select', shiftDate(props.date, -7)),
)
</script>

<template>
  <div
    class="flex justify-between"
    @touchstart="swipe.onTouchstart"
    @touchmove="swipe.onTouchmove"
    @touchend="swipe.onTouchend"
  >
    <button
      v-for="(day, i) in days"
      :key="day"
      type="button"
      @click="emit('select', day)"
      class="flex flex-col items-center gap-1 w-9 py-1.5 rounded-xl"
      :class="day === props.date ? 'bg-accent text-white' : 'text-ink'"
    >
      <span class="text-[11px] uppercase" :class="day === props.date ? 'text-white/80' : 'text-muted'">
        {{ WEEKDAY_LABELS[i] }}
      </span>
      <span class="text-sm font-semibold leading-none">{{ Number(day.slice(8, 10)) }}</span>
      <span
        class="w-1 h-1 rounded-full"
        :class="[
          datesWithEntries.has(day) ? (day === props.date ? 'bg-white' : 'bg-accent') : 'bg-transparent',
        ]"
      />
      <span v-if="day === today && day !== props.date" class="sr-only">сегодня</span>
    </button>
  </div>
</template>
