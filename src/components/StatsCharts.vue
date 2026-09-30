<script setup lang="ts">
// Графики (README «Статистика → Графики»): период со стрелками, средние в
// день и итого разница за период, калории по дням (+ разница), Б/Ж/У.
// Тап по столбику — цифры этого дня строкой над графиками.
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { capitalizeFirst, formatDateWithWeekday, formatDayShort } from '../lib/date'
import { periodAverages, statsPeriod, type DaySummary, type StatsPeriodKind } from '../lib/stats'
import { TREAT_ICON, TREAT_LABEL_PLURAL } from '../lib/treat'
import StatsBarChart, { type ChartBar } from './StatsBarChart.vue'

const props = defineProps<{
  today: string
  summarize: (date: string) => DaySummary
}>()
const router = useRouter()

const KINDS: { value: StatsPeriodKind; label: string }[] = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: '3 месяца' },
]
const kind = ref<StatsPeriodKind>('week')
const offset = ref(0)
const selected = ref<string | null>(null)
watch(kind, () => {
  offset.value = 0
  selected.value = null
})
watch(offset, () => (selected.value = null))

const period = computed(() => statsPeriod(kind.value, props.today, offset.value))
// Будущие дни периода — пустые места на оси, без сводки
const summaries = computed(() => period.value.dates.map((d) => (d > props.today ? null : props.summarize(d))))
const averages = computed(() => periodAverages(summaries.value.filter((s): s is DaySummary => s !== null), props.today))

const monthName = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date(`${date}T12:00:00`))
const dayMonth = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`))
const periodLabel = computed(() => {
  const dates = period.value.dates
  const first = dates[0]!
  const last = dates.at(-1)!
  const year = first.slice(0, 4)
  if (kind.value === 'week') return `${dayMonth(first)} – ${dayMonth(last)}`
  if (kind.value === 'month') return `${capitalizeFirst(monthName(first))} ${year}`
  const lastYear = last.slice(0, 4)
  return `${capitalizeFirst(monthName(first))}${year === lastYear ? '' : ` ${year}`} – ${monthName(last)} ${lastYear}`
})

type Key = 'kcal' | 'protein' | 'fat' | 'carbs'
function barsFor(key: Key): ChartBar[] {
  return period.value.dates.map((date, i) => {
    const s = summaries.value[i]
    return {
      date,
      value: s && s.hasEntries ? s.eaten[key] : null,
      // Цель — только у дней с записями: иначе до начала ведения дневника
      // тянется ряд одиноких чёрточек
      goal: s?.hasEntries && s.goal ? s.goal[key] : null,
      status: s && s.hasEntries ? s.status[key] : null,
      today: date === props.today,
    }
  })
}
const differenceBars = computed<ChartBar[]>(() =>
  period.value.dates.map((date, i) => {
    const s = summaries.value[i]
    return {
      date,
      value: s && s.hasEntries ? s.differenceKcal : null,
      goal: null,
      status: null,
      today: date === props.today,
    }
  }),
)

const selectedSummary = computed(() => {
  if (!selected.value) return null
  const i = period.value.dates.indexOf(selected.value)
  return i === -1 ? null : summaries.value[i]
})
function select(date: string) {
  selected.value = selected.value === date ? null : date
}

const int = (n: number) => Math.round(n).toLocaleString('ru-RU')
function signed(n: number): string {
  const r = Math.round(n)
  return r > 0 ? `+${r.toLocaleString('ru-RU')}` : r < 0 ? `−${Math.abs(r).toLocaleString('ru-RU')}` : '0'
}
const daysWord = (n: number) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'день'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня'
  return 'дней'
}
const axis = computed(() => {
  const d = period.value.dates
  return [d[0]!, d[Math.floor(d.length / 2)]!, d.at(-1)!].map(formatDayShort)
})
</script>

<template>
  <div class="flex flex-col gap-3 pt-3">
    <div class="flex gap-1 text-sm">
      <button
        v-for="k in KINDS"
        :key="k.value"
        type="button"
        @click="kind = k.value"
        class="flex-1 py-1.5 rounded-xl"
        :class="kind === k.value ? 'bg-card border border-line text-ink' : 'text-muted border border-transparent'"
      >
        {{ k.label }}
      </button>
    </div>

    <div class="flex items-center justify-between">
      <button type="button" aria-label="Предыдущий период" @click="offset--" class="w-9 h-9 flex items-center justify-center text-ink">
        <ChevronLeft :size="20" />
      </button>
      <span class="text-sm font-medium text-ink">{{ periodLabel }}</span>
      <button
        type="button"
        aria-label="Следующий период"
        :disabled="offset >= 0"
        @click="offset++"
        class="w-9 h-9 flex items-center justify-center text-ink disabled:opacity-30"
      >
        <ChevronRight :size="20" />
      </button>
    </div>

    <section class="rounded-2xl bg-card border border-line p-4">
      <template v-if="averages.days > 0">
        <h3 class="text-xs text-muted mb-2">
          В среднем за день · {{ averages.days }} {{ daysWord(averages.days) }} с записями, без сегодняшнего
        </h3>
        <div class="grid grid-cols-3 gap-y-3 text-center tabular-nums">
          <div>
            <p class="text-[11px] text-muted">Съедено</p>
            <p class="text-sm font-semibold text-ink">{{ int(averages.eaten!.kcal) }}</p>
          </div>
          <div>
            <p class="text-[11px] text-muted">Потрачено</p>
            <p class="text-sm font-semibold text-ink">{{ averages.spentKcal === null ? '—' : int(averages.spentKcal) }}</p>
          </div>
          <div>
            <p class="text-[11px] text-muted">Разница</p>
            <p class="text-sm font-semibold text-ink">{{ averages.differenceKcal === null ? '—' : signed(averages.differenceKcal) }}</p>
          </div>
          <div>
            <p class="text-[11px] text-muted">Ж, г</p>
            <p class="text-sm font-semibold text-ink">{{ int(averages.eaten!.fat) }}</p>
          </div>
          <div>
            <p class="text-[11px] text-muted">У, г</p>
            <p class="text-sm font-semibold text-ink">{{ int(averages.eaten!.carbs) }}</p>
          </div>
          <div>
            <p class="text-[11px] text-muted">Б, г</p>
            <p class="text-sm font-semibold text-ink">{{ int(averages.eaten!.protein) }}</p>
          </div>
        </div>
        <p v-if="averages.treat && averages.treat.kcal > 0" class="mt-3 text-xs text-muted">
          {{ TREAT_ICON }} {{ TREAT_LABEL_PLURAL }} в среднем: {{ int(averages.treat.kcal) }} ккал в день
          ({{ Math.round((averages.treat.kcal / averages.eaten!.kcal) * 100) }}%) · Ж {{ int(averages.treat.fat) }} · У
          {{ int(averages.treat.carbs) }} · Б {{ int(averages.treat.protein) }}; основная еда —
          {{ int(averages.eaten!.kcal - averages.treat.kcal) }} ккал
        </p>
        <p v-if="averages.totalDifferenceKcal !== null" class="mt-3 pt-3 border-t border-line text-sm text-ink flex justify-between">
          <span>Итого разница за период</span>
          <span class="font-semibold tabular-nums">{{ signed(averages.totalDifferenceKcal) }} ккал</span>
        </p>
        <p v-else class="mt-3 text-xs text-muted">Потрачено и разница считаются, когда в настройках задана цель (там энергия покоя).</p>
      </template>
      <p v-else class="text-sm text-muted">За этот период нет законченных дней с записями.</p>
    </section>

    <div class="min-h-10 text-xs">
      <button v-if="selectedSummary" type="button" @click="router.push(`/day/${selected}`)" class="w-full text-left rounded-xl bg-card border border-line px-3 py-2">
        <span class="font-medium text-ink">{{ capitalizeFirst(formatDateWithWeekday(selectedSummary.date)) }}</span>
        <template v-if="selectedSummary.hasEntries">
          <span class="block text-muted mt-0.5 tabular-nums">
            {{ int(selectedSummary.eaten.kcal) }}<template v-if="selectedSummary.goal"> / {{ int(selectedSummary.goal.kcal) }}</template> ккал
            <template v-if="selectedSummary.spentKcal !== null">
              · потрачено {{ int(selectedSummary.spentKcal) }} · разница {{ signed(selectedSummary.differenceKcal!) }}</template
            >
          </span>
          <span class="block text-muted tabular-nums">
            Ж {{ int(selectedSummary.eaten.fat) }}<template v-if="selectedSummary.goal">/{{ int(selectedSummary.goal.fat) }}</template>
            · У {{ int(selectedSummary.eaten.carbs) }}<template v-if="selectedSummary.goal">/{{ int(selectedSummary.goal.carbs) }}</template>
            · Б {{ int(selectedSummary.eaten.protein) }}<template v-if="selectedSummary.goal">/{{ int(selectedSummary.goal.protein) }}</template>
            <span class="text-accent"> · открыть день ›</span>
          </span>
        </template>
        <span v-else class="block text-muted mt-0.5">Нет записей · <span class="text-accent">открыть день ›</span></span>
      </button>
      <p v-else class="text-muted px-1 pt-1">Тап по столбику — цифры этого дня. Столбик — съедено, чёрточка — цель.</p>
    </div>

    <StatsBarChart title="Калории, ккал" :bars="barsFor('kcal')" :selected="selected" height-class="h-32" @select="select" />
    <StatsBarChart title="Разница (съедено − потрачено), ккал" :bars="differenceBars" :selected="selected" diverging height-class="h-20" @select="select" />
    <div class="flex justify-between text-[10px] text-muted tabular-nums -mt-2 px-3">
      <span v-for="(label, i) in axis" :key="i">{{ label }}</span>
    </div>
    <StatsBarChart title="Жиры, г" :bars="barsFor('fat')" :selected="selected" height-class="h-16" @select="select" />
    <StatsBarChart title="Углеводы, г" :bars="barsFor('carbs')" :selected="selected" height-class="h-16" @select="select" />
    <StatsBarChart title="Белки, г" :bars="barsFor('protein')" :selected="selected" height-class="h-16" @select="select" />
    <div class="flex justify-between text-[10px] text-muted tabular-nums -mt-2 px-3">
      <span v-for="(label, i) in axis" :key="i">{{ label }}</span>
    </div>
  </div>
</template>
