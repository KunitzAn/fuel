<script setup lang="ts">
// Лента (README «Статистика → Лента»): строка на день, от сегодня в
// прошлое до первой записи, подгрузка порциями при прокрутке. Все данные
// уже локально (Dexie) — «порции» только про то, сколько строк рисовать.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { WEEKDAY_LABELS } from '../lib/date'
import { datesBackwards, type DaySummary } from '../lib/stats'

const props = defineProps<{
  today: string
  earliest: string | null
  summarize: (date: string) => DaySummary
}>()

const router = useRouter()

const PORTION = 60
const shown = ref(PORTION)
const rows = ref<DaySummary[]>([])
watch(
  () => [props.today, props.earliest, props.summarize, shown.value] as const,
  () => {
    rows.value = props.earliest ? datesBackwards(props.today, shown.value, props.earliest).map(props.summarize) : []
  },
  { immediate: true },
)
const hasMore = () => rows.value.length === shown.value

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
onMounted(() => {
  observer = new IntersectionObserver((items) => {
    if (items.some((i) => i.isIntersecting) && hasMore()) shown.value += PORTION
  }, { rootMargin: '400px' })
  if (sentinel.value) observer.observe(sentinel.value)
})
onBeforeUnmount(() => observer?.disconnect())

function weekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAY_LABELS[(new Date(y!, m! - 1, d!).getDay() + 6) % 7]!
}
const int = (n: number) => Math.round(n).toLocaleString('ru-RU')
function signed(n: number): string {
  const r = Math.round(n)
  return r > 0 ? `+${r.toLocaleString('ru-RU')}` : r < 0 ? `−${Math.abs(r).toLocaleString('ru-RU')}` : '0'
}
</script>

<template>
  <div>
    <p v-if="!earliest" class="py-8 text-center text-sm text-muted">Пока нет ни одной записи в дневнике</p>

    <button
      v-for="row in rows"
      :key="row.date"
      :data-date="row.date"
      type="button"
      @click="router.push(`/day/${row.date}`)"
      class="w-full grid grid-cols-[2.75rem_repeat(6,minmax(0,1fr))] items-center gap-x-1 py-2 border-b border-line text-right tabular-nums active:bg-card"
    >
      <!-- Как в FatSecret (владелица): число крупно, день недели под ним;
           месяц — в липкой шапке страницы (StatsView), не в строке -->
      <span class="text-left leading-tight">
        <span class="block text-[15px] font-semibold text-ink">{{ Number(row.date.slice(8)) }}</span>
        <span class="block text-[11px] text-muted">{{ weekday(row.date) }}</span>
      </span>

      <span v-if="!row.hasEntries" class="col-span-6 self-center text-center text-xs text-muted">— нет записей —</span>
      <template v-else>
        <!-- Только факт, без цели дня (владелица) -->
        <span class="text-[13px] font-semibold text-fat">{{ int(row.eaten.fat) }}</span>
        <span class="text-[13px] font-semibold text-carbs">{{ int(row.eaten.carbs) }}</span>
        <span class="text-[13px] font-semibold text-protein">{{ int(row.eaten.protein) }}</span>
        <span class="text-[13px] font-semibold text-kcal">{{ int(row.eaten.kcal) }}</span>
        <span class="text-[13px] text-ink">{{ row.spentKcal === null ? '—' : int(row.spentKcal) }}</span>
        <span class="text-[13px] text-ink">{{ row.differenceKcal === null ? '—' : signed(row.differenceKcal) }}</span>
      </template>
    </button>

    <div ref="sentinel" class="h-px" />
  </div>
</template>
