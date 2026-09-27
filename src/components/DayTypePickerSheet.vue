<script setup lang="ts">
// Выбор поправки при простановке плана на высоко-/низкоуглеводный день
// (этап 4.4, не из README — новая мысль владелицы): вручную заданное в
// настройках число или среднее по факту прошлых дней этого же типа.
import { computed, ref } from 'vue'
import type { DayType, Entry } from '../lib/db'
import type { DayTypePlan } from '../lib/dayTypes'
import { manualDayTypeDelta, statsDayTypeDelta, type DayTypeKind, type GoalInput } from '../lib/goals'

const props = defineProps<{
  date: string
  kind: DayTypeKind
  settings: GoalInput
  entries: Entry[]
  dayTypeRows: DayType[]
}>()
const emit = defineEmits<{ close: []; pick: [DayTypePlan] }>()

const KIND_LABEL = { high: 'высокоуглеводный', low: 'низкоуглеводный' } as const

const periodDays = ref<30 | null>(30)

const manualDelta = computed(() => manualDayTypeDelta(props.kind, props.settings))
const statsDelta = computed(() =>
  statsDayTypeDelta(props.kind, props.settings, props.entries, props.dayTypeRows, periodDays.value, props.date),
)

function formatDelta(d: { protein: number; fat: number; carbs: number }): string {
  const part = (v: number, unit: string) => `${v > 0 ? '+' : ''}${Math.round(v)}${unit}`
  return `Б ${part(d.protein, '')} · Ж ${part(d.fat, '')} · У ${part(d.carbs, '')}`
}

function pick(source: 'manual' | 'stats') {
  const delta = source === 'manual' ? manualDelta.value : statsDelta.value
  if (!delta) return
  emit('pick', { kind: props.kind, source, delta })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="relative w-full max-w-md rounded-t-3xl bg-bg px-4 pt-5 pb-8 flex flex-col gap-4">
      <h2 class="text-base font-semibold text-ink">Откуда взять поправку — {{ KIND_LABEL[kind] }} день?</h2>

      <button
        type="button"
        :disabled="!manualDelta"
        @click="pick('manual')"
        class="rounded-2xl border border-line px-4 py-3 text-left disabled:opacity-40"
      >
        <p class="text-sm text-ink">Вручную (из настроек)</p>
        <p class="text-xs text-muted mt-0.5">
          {{ manualDelta ? formatDelta(manualDelta) : `Не заполнено в настройках для «${KIND_LABEL[kind]}»` }}
        </p>
      </button>

      <div class="rounded-2xl border border-line px-4 py-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-ink">По статистике</p>
          <div class="flex gap-1 text-xs">
            <button
              type="button"
              @click="periodDays = 30"
              class="px-2 py-1 rounded-full"
              :class="periodDays === 30 ? 'bg-accent text-white' : 'text-muted'"
            >
              30 дней
            </button>
            <button
              type="button"
              @click="periodDays = null"
              class="px-2 py-1 rounded-full"
              :class="periodDays === null ? 'bg-accent text-white' : 'text-muted'"
            >
              всё время
            </button>
          </div>
        </div>
        <p v-if="statsDelta" class="text-xs text-muted mt-1">{{ formatDelta(statsDelta) }}</p>
        <p v-else class="text-xs text-muted mt-1">
          Пока нет дней с отметкой факта «{{ KIND_LABEL[kind] }}» за этот период
        </p>
        <button
          type="button"
          :disabled="!statsDelta"
          @click="pick('stats')"
          class="mt-2 w-full rounded-xl py-2 text-sm font-medium text-white bg-accent disabled:opacity-40"
        >
          Взять из статистики
        </button>
      </div>

      <button type="button" @click="emit('close')" class="text-sm text-muted">Отмена</button>
    </div>
  </div>
</template>
