<script setup lang="ts">
// Окно ввода граммов при ДОБАВЛЕНИИ (README «Окно ввода граммов»).
// Отдельно от GramsEditSheet — та правит уже существующую запись без
// выбора приёма, а здесь приём — часть решения.
import { ChevronDown, Pencil } from '@lucide/vue'
import { computed, ref } from 'vue'
import type { Food } from '../lib/db'
import { addEntryFromFood, targetLabel, type MealTarget } from '../lib/diary'
import { parseDecimal, scaleByGrams } from '../lib/nutrition'
import FoodFormSheet from './FoodFormSheet.vue'
import MealTargetSheet from './MealTargetSheet.vue'

const props = defineProps<{ food: Food; date: string; target: MealTarget }>()
const emit = defineEmits<{ close: []; added: [] }>()

// props.food — снимок на момент открытия окна, не живой запрос: правка/
// удаление продукта закрывает и это окно целиком, а не пытается обновить
// цифры на лету (список Продуктов/Блюд за ним и так живой, откроет заново
// с уже верными данными).
const editingFood = ref(false)

// Граммы с прошлого раза для этого продукта — впервые 100 г (README).
const gramsInput = ref(String(props.food.lastGrams ?? 100))
const grams = computed(() => parseDecimal(gramsInput.value) ?? 0)
const target = ref<MealTarget>(props.target)
const pickingTarget = ref(false)

const per100 = computed(() => ({
  protein: props.food.protein,
  fat: props.food.fat,
  carbs: props.food.carbs,
  kcal: props.food.kcal,
}))
const scaled = computed(() => scaleByGrams(per100.value, grams.value))

function pickTarget(t: MealTarget) {
  target.value = t
  pickingTarget.value = false
}

async function add() {
  if (grams.value <= 0) return
  await addEntryFromFood(props.food, props.date, target.value, grams.value)
  emit('added')
}

function onFoodSaved() {
  editingFood.value = false
  emit('close')
}
function onFoodDeleted() {
  editingFood.value = false
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="relative w-full max-w-md rounded-t-3xl bg-bg px-4 pt-5 pb-8 flex flex-col gap-4">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-ink">{{ food.name }}</h2>
          <p class="text-xs text-muted">
            на 100 г: Б {{ per100.protein }} · Ж {{ per100.fat }} · У {{ per100.carbs }} · {{ Math.round(per100.kcal) }} ккал
          </p>
        </div>
        <button
          type="button"
          aria-label="Изменить продукт"
          @click="editingFood = true"
          class="w-8 h-8 rounded-full flex items-center justify-center text-muted shrink-0"
        >
          <Pencil :size="16" />
        </button>
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
          @click="pickingTarget = true"
          class="flex-1 rounded-2xl py-3 text-sm text-ink border border-line flex items-center justify-center gap-1"
        >
          {{ targetLabel(target) }}
          <ChevronDown :size="14" />
        </button>
        <button
          type="button"
          :disabled="grams <= 0"
          @click="add"
          class="flex-1 rounded-2xl py-3 text-sm font-medium text-white bg-accent disabled:opacity-40"
        >
          Добавить
        </button>
      </div>
    </div>

    <MealTargetSheet v-if="pickingTarget" :date="date" @close="pickingTarget = false" @pick="pickTarget" />
    <FoodFormSheet
      v-if="editingFood"
      :kind="food.kind"
      :food="food"
      @close="editingFood = false"
      @saved="onFoodSaved"
      @deleted="onFoodDeleted"
    />
  </div>
</template>
