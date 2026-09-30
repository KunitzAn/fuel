<script setup lang="ts">
// Столбики по дням + чёрточка цели (README «Графики»). Своё SVG, без
// библиотеки: 7–92 столбика, ничего интерактивнее тапа не нужно. Цвет
// столбика — статус дня (lib/statusColors.ts), как в дневнике и ленте.
// `diverging` — для разницы: ноль посередине, профицит вверх, дефицит вниз.
import { computed } from 'vue'
import type { BoundStatus } from '../lib/goals'
import { statusFillClass } from '../lib/statusColors'

export interface ChartBar {
  date: string
  value: number | null
  goal: number | null
  status: BoundStatus | null
  today: boolean
}

const props = defineProps<{
  title: string
  bars: ChartBar[]
  selected: string | null
  diverging?: boolean
  heightClass?: string
}>()
const emit = defineEmits<{ select: [date: string] }>()

const STEP = 10
const width = computed(() => props.bars.length * STEP)
const scale = computed(() => {
  let max = 1
  for (const b of props.bars) {
    if (b.value !== null) max = Math.max(max, Math.abs(b.value))
    if (b.goal !== null) max = Math.max(max, b.goal)
  }
  return max * 1.08
})
// y в координатах 0…100: обычный график — от низа, diverging — от середины
function y(v: number): number {
  return props.diverging ? 50 - (v / scale.value) * 50 : 100 - (v / scale.value) * 100
}
const gap = computed(() => (props.bars.length > 40 ? 1 : 2))

function barRect(b: ChartBar, i: number) {
  const v = b.value ?? 0
  const top = props.diverging ? Math.min(y(v), 50) : y(v)
  const bottom = props.diverging ? Math.max(y(v), 50) : 100
  return { x: i * STEP + gap.value, width: STEP - gap.value * 2, y: top, height: Math.max(bottom - top, v === 0 ? 0 : 0.8) }
}
</script>

<template>
  <section class="rounded-2xl bg-card border border-line p-3">
    <div class="flex items-baseline justify-between mb-1.5">
      <h3 class="text-xs font-semibold text-ink">{{ title }}</h3>
      <span class="text-[10px] text-muted tabular-nums">{{ diverging ? '±' : '' }}{{ Math.round(scale / 1.08).toLocaleString('ru-RU') }}</span>
    </div>
    <svg
      :viewBox="`0 0 ${width} 100`"
      preserveAspectRatio="none"
      class="w-full block"
      :class="heightClass ?? 'h-24'"
    >
      <line v-if="diverging" x1="0" :x2="width" y1="50" y2="50" class="stroke-line" vector-effect="non-scaling-stroke" stroke-width="1" />
      <line v-else x1="0" :x2="width" y1="100" y2="100" class="stroke-line" vector-effect="non-scaling-stroke" stroke-width="1" />
      <g v-for="(b, i) in bars" :key="b.date" @click="emit('select', b.date)" class="cursor-pointer">
        <rect :x="i * STEP" y="0" :width="STEP" height="100" :class="b.date === selected ? 'fill-line' : 'fill-transparent'" />
        <rect
          v-if="b.value !== null"
          v-bind="barRect(b, i)"
          :class="[diverging ? 'fill-muted' : statusFillClass(b.status), b.today ? 'opacity-40' : '']"
        />
        <line
          v-if="b.goal !== null && !diverging"
          :x1="i * STEP + 0.5"
          :x2="i * STEP + STEP - 0.5"
          :y1="y(b.goal)"
          :y2="y(b.goal)"
          class="stroke-ink"
          vector-effect="non-scaling-stroke"
          stroke-width="2"
        />
      </g>
    </svg>
  </section>
</template>
