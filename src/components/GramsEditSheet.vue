<script setup lang="ts">
// Правка граммов существующей записи (README: «Тап по еде — правка
// граммов»). Полноценное окно ввода граммов для НОВОЙ записи — этап 1.5,
// у него будет и подстановка «граммы с прошлого раза», и выбор приёма.
import { computed, ref } from 'vue'
import type { Entry } from '../lib/db'
import { updateEntryGrams } from '../lib/diary'
import { parseDecimal, scaleByGrams } from '../lib/nutrition'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ close: [] }>()

const gramsInput = ref(String(props.entry.grams))
const grams = computed(() => parseDecimal(gramsInput.value) ?? 0)

const per100 = computed(() => ({
  protein: props.entry.protein,
  fat: props.entry.fat,
  carbs: props.entry.carbs,
  kcal: props.entry.kcal,
}))
const scaled = computed(() => scaleByGrams(per100.value, grams.value))

async function save() {
  if (grams.value <= 0) return
  await updateEntryGrams(props.entry.id, grams.value)
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="relative w-full max-w-md rounded-t-3xl bg-bg px-4 pt-5 pb-8 flex flex-col gap-4">
      <div>
        <h2 class="text-base font-semibold text-ink">{{ entry.name }}</h2>
        <p class="text-xs text-muted">
          на 100 г: Б {{ per100.protein }} · Ж {{ per100.fat }} · У {{ per100.carbs }} · {{ Math.round(per100.kcal) }} ккал
        </p>
      </div>

      <div class="flex items-center gap-2 rounded-2xl bg-card border border-line px-4 py-3">
        <input
          v-model="gramsInput"
          type="text"
          inputmode="decimal"
          autofocus
          class="flex-1 text-2xl font-semibold text-ink bg-transparent outline-none"
        />
        <span class="text-sm text-muted">г</span>
      </div>

      <p class="text-sm text-muted">
        Б {{ scaled.protein.toFixed(1) }} · Ж {{ scaled.fat.toFixed(1) }} · У {{ scaled.carbs.toFixed(1) }} ·
        {{ Math.round(scaled.kcal) }} ккал
      </p>

      <div class="flex gap-2">
        <button
          type="button"
          @click="emit('close')"
          class="flex-1 rounded-2xl py-3 text-sm text-muted border border-line"
        >
          Отмена
        </button>
        <button
          type="button"
          :disabled="grams <= 0"
          @click="save"
          class="flex-1 rounded-2xl py-3 text-sm font-medium text-white bg-accent disabled:opacity-40"
        >
          Сохранить
        </button>
      </div>
    </div>
  </div>
</template>
