<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
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
// Свайп — только пальцем; стрелки по краям — для мыши и для тех, кто не
// догадывается свайпать (владелица листала недели через календарь).
const nextWeek = () => emit('select', shiftDate(props.date, 7))
const prevWeek = () => emit('select', shiftDate(props.date, -7))
const swipe = useSwipe(nextWeek, prevWeek)
</script>

<template>
  <div
    class="flex items-center gap-1"
    @touchstart="swipe.onTouchstart"
    @touchmove="swipe.onTouchmove"
    @touchend="swipe.onTouchend"
  >
    <button type="button" aria-label="Предыдущая неделя" @click="prevWeek" class="w-6 h-12 -ml-1.5 flex items-center justify-center text-muted shrink-0">
      <ChevronLeft :size="18" />
    </button>
    <div class="flex-1 flex justify-between">
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
    <button type="button" aria-label="Следующая неделя" @click="nextWeek" class="w-6 h-12 -mr-1.5 flex items-center justify-center text-muted shrink-0">
      <ChevronRight :size="18" />
    </button>
  </div>
</template>
