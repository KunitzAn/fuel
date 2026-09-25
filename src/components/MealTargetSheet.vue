<script setup lang="ts">
// Выбор приёма/перекуса — и в шапке экрана добавления («можно сменить
// приём, вкл. перекусы»), и в самом окне ввода граммов.
import { computed } from 'vue'
import { db } from '../lib/db'
import { bySnackPosition, MEAL_LABELS, type Meal, type MealTarget } from '../lib/diary'
import { useLiveQuery } from '../lib/useLiveQuery'

const props = defineProps<{ date: string }>()
const emit = defineEmits<{ close: []; pick: [MealTarget] }>()

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner']

const snacks = useLiveQuery(
  () => db.snacks.where('date').equals(props.date).and((s) => !s.deletedAt).toArray(),
  [],
)
const snacksByMeal = computed(() => ({
  breakfast: snacks.value.filter((s) => s.after === 'breakfast').sort(bySnackPosition),
  lunch: snacks.value.filter((s) => s.after === 'lunch').sort(bySnackPosition),
  dinner: snacks.value.filter((s) => s.after === 'dinner').sort(bySnackPosition),
}))

function pickMeal(meal: Meal) {
  emit('pick', { type: 'meal', meal })
}
function pickSnack(snackId: string, name: string) {
  emit('pick', { type: 'snack', snackId, name })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="relative w-full max-w-md rounded-t-3xl bg-bg px-4 pt-5 pb-8 flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
      <h2 class="text-base font-semibold text-ink mb-1">Куда добавить?</h2>

      <template v-for="meal in MEALS" :key="meal">
        <button
          type="button"
          @click="pickMeal(meal)"
          class="rounded-2xl bg-card border border-line px-4 py-3 text-left text-sm font-medium text-ink"
        >
          {{ MEAL_LABELS[meal] }}
        </button>
        <button
          v-for="snack in snacksByMeal[meal]"
          :key="snack.id"
          type="button"
          @click="pickSnack(snack.id, snack.name)"
          class="ml-4 rounded-2xl bg-card border border-line px-4 py-2.5 text-left text-sm text-ink"
        >
          {{ snack.name }}
        </button>
      </template>

      <button type="button" @click="emit('close')" class="mt-2 rounded-2xl py-3 text-sm text-muted">
        Отмена
      </button>
    </div>
  </div>
</template>
