<script setup lang="ts">
// Столбики по дням (README «Графики»). Обычный HTML, а не SVG: шкала слева
// и числа над столбиками — текст, а растянутый SVG сплющил бы буквы.
// Цвет столбиков — цвет нутриента (этап 8). Чёрточки цели нет (владелица,
// 04.10: «пока убираем»).
// `diverging` — для разницы: ноль посередине, перебор вверх (красный),
// дефицит вниз (бирюзовый) — владелица выбрала ноль, подписи и два цвета.
import { computed } from 'vue'

export interface ChartBar {
  date: string
  value: number | null
  today: boolean
}

const props = defineProps<{
  title: string
  subtitle?: string
  bars: ChartBar[]
  selected: string | null
  /** Числа над всеми столбиками (неделя) или только над выбранным. */
  valuesForAll: boolean
  diverging?: boolean
  heightClass?: string
  /** Цвет столбиков — цвет нутриента (CSS-переменная). */
  color?: string
}>()
const emit = defineEmits<{ select: [date: string] }>()

// Шаг шкалы — «круглый» (владелица: «например каждые 25 или 50»), чтобы
// линий было не больше четырёх на сторону
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]
function niceStep(max: number): number {
  return STEPS.find((s) => max / s <= 4) ?? STEPS.at(-1)!
}

const range = computed(() => {
  let pos = 0
  let neg = 0
  for (const b of props.bars) {
    if (b.value === null) continue
    pos = Math.max(pos, b.value)
    neg = Math.max(neg, -b.value)
  }
  const step = niceStep(Math.max(pos, neg, 1))
  // У «разницы» всегда хотя бы по шагу в обе стороны — есть куда расти
  // и подписям «перебор» / «дефицит»
  const top = Math.max(Math.ceil(pos / step), 1) * step
  const bottom = props.diverging ? Math.max(Math.ceil(neg / step), 1) * step : 0
  return { step, top, bottom }
})

/** Положение значения по высоте, % от верха области графика. */
function yPct(v: number): number {
  const { top, bottom } = range.value
  return ((top - v) / (top + bottom)) * 100
}
const hasData = computed(() => props.bars.some((b) => b.value !== null))
const ticks = computed(() => {
  if (!hasData.value) return [0] // пустой период — только линия нуля
  const { step, top, bottom } = range.value
  const out: number[] = []
  for (let v = -bottom; v <= top; v += step) out.push(v || 0)
  return out
})

// `|| 0` — иначе нижняя линия шкалы подписывалась «−0»
const int = (n: number) => (Math.round(n) || 0).toLocaleString('ru-RU')
function label(n: number): string {
  if (!props.diverging) return int(n)
  const r = Math.round(n) || 0
  return r > 0 ? `+${int(r)}` : r < 0 ? `−${int(-r)}` : '0'
}

function barStyle(v: number) {
  const zero = yPct(0)
  const at = yPct(v)
  return { top: `${Math.min(zero, at)}%`, height: `${Math.max(Math.abs(at - zero), v === 0 ? 0 : 0.8)}%` }
}
function barColor(v: number): string {
  if (!props.diverging) return props.color ?? 'var(--muted)'
  return v > 0 ? 'var(--activity)' : 'var(--snack)'
}
// Где число. Неделя (широкие столбики) — прямо над столбиком, у дефицита —
// под ним. Месяц и дольше — узкие столбики: под ними число наезжало бы на
// соседние (владелица, 04.10), поэтому — в свободной полосе над графиком,
// над выбранной колонкой; у краёв прижато внутрь, чтобы не вылезало
function valueStyle(v: number, i: number) {
  const n = props.bars.length
  if (n <= 14) {
    const y = v < 0 ? { top: `calc(${yPct(v)}% + 2px)` } : { bottom: `calc(${100 - yPct(v)}% + 2px)` }
    return { cls: 'left-1/2 -translate-x-1/2', style: y }
  }
  const edge = i < n * 0.15 || i >= n * 0.85
  const x = !edge ? 'left-1/2 -translate-x-1/2' : i < n / 2 ? 'left-0' : 'right-0'
  return { cls: x, style: { top: '-0.875rem' } }
}
function showValue(b: ChartBar) {
  return b.value !== null && (props.valuesForAll || b.date === props.selected)
}
</script>

<template>
  <section class="rounded-2xl glass p-3">
    <div class="flex items-baseline justify-between gap-2 mb-1">
      <div>
        <h3 class="text-xs font-semibold text-ink">{{ title }}</h3>
        <p v-if="subtitle" class="text-[10px] text-muted">{{ subtitle }}</p>
      </div>
      <span v-if="diverging" class="text-[10px] whitespace-nowrap flex gap-2">
        <span class="text-activity">↑ перебор</span>
        <span class="text-snack">↓ дефицит</span>
      </span>
    </div>

    <!-- Сверху и снизу запас под числа над крайними столбиками -->
    <div class="flex pt-4" :class="diverging ? 'pb-4' : ''">
      <!-- Шкала слева -->
      <div class="relative w-9 shrink-0" :class="heightClass ?? 'h-24'">
        <span
          v-for="t in ticks"
          :key="t"
          class="absolute right-1.5 -translate-y-1/2 text-[10px] leading-none text-muted tabular-nums"
          :style="{ top: `${yPct(t)}%` }"
        >{{ label(t) }}</span>
      </div>

      <div class="relative flex-1" :class="heightClass ?? 'h-24'">
        <div
          v-for="t in ticks"
          :key="t"
          class="absolute inset-x-0 border-t"
          :class="t === 0 ? 'border-muted/60' : 'border-line border-dashed'"
          :style="{ top: `${yPct(t)}%` }"
        />
        <div class="absolute inset-0 flex">
          <button
            v-for="(b, i) in bars"
            :key="b.date"
            type="button"
            :aria-label="b.date"
            @click="emit('select', b.date)"
            class="relative flex-1 h-full rounded-sm"
            :class="b.date === selected ? 'bg-ink/8' : ''"
          >
            <span
              v-if="b.value !== null"
              class="absolute rounded-[2px]"
              :class="[bars.length > 40 ? 'inset-x-px' : 'inset-x-[18%]', b.today ? 'opacity-40' : '']"
              :style="{ ...barStyle(b.value), backgroundColor: barColor(b.value) }"
            />
            <span
              v-if="showValue(b)"
              class="absolute whitespace-nowrap text-[10px] leading-none font-semibold tabular-nums text-ink"
              :class="valueStyle(b.value!, i).cls"
              :style="valueStyle(b.value!, i).style"
            >{{ label(b.value!) }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
