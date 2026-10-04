<script setup lang="ts">
// Окно ввода граммов при ДОБАВЛЕНИИ (README «Окно ввода граммов»).
// Отдельно от GramsEditSheet — та правит уже существующую запись без
// выбора приёма, а здесь приём — часть решения.
import { ChevronDown, Pencil } from '@lucide/vue'
import { computed, ref } from 'vue'
import { db } from '../lib/db'
import { addEntry, lastTreatChoice, targetLabel, type MealTarget } from '../lib/diary'
import { parseDecimal, scaleByGrams } from '../lib/nutrition'
import { pickFromFood, type PickItem } from '../lib/pick'
import { TREAT_LABEL, TreatIcon } from '../lib/treat'
import FoodFormSheet from './FoodFormSheet.vue'
import MealTargetSheet from './MealTargetSheet.vue'

// item — свой продукт/блюдо, продукт каталога или строка Истории (lib/pick.ts)
const props = defineProps<{ item: PickItem; date: string; target: MealTarget }>()
const emit = defineEmits<{ close: []; added: [] }>()

// props.item — снимок на момент открытия окна, не живой запрос: правка/
// удаление продукта закрывает и это окно целиком, а не пытается обновить
// цифры на лету (список Продуктов/Блюд за ним и так живой, откроет заново
// с уже верными данными).
const editingFood = ref(false)

// Граммы с прошлого раза для этого продукта — впервые 100 г (README).
// Тап по полю очищает его — как в окне правки записи (владелица); граммы с
// прошлого раза остаются подсказкой и значением, пока ничего не вписано
const defaultGrams = props.item.lastGrams ?? 100
const gramsInput = ref(String(defaultGrams))
const grams = computed(() => parseDecimal(gramsInput.value) ?? defaultGrams)
function clearOnFocus() {
  if (gramsInput.value === String(defaultGrams)) gramsInput.value = ''
}
const target = ref<MealTarget>(props.target)

// Вкусняшку можно отметить сразу при добавлении (владелица); по умолчанию —
// как в последней записи этого продукта (lib/diary.ts lastTreatChoice).
// Пока ищем, галочку не трогали — если её успели тронуть, не перебиваем
const treat = ref(false)
let treatTouched = false
const touchTreat = () => (treatTouched = true)
void lastTreatChoice(props.item).then((v) => {
  if (!treatTouched) treat.value = v
})
const pickingTarget = ref(false)

const per100 = computed(() => ({
  protein: props.item.protein,
  fat: props.item.fat,
  carbs: props.item.carbs,
  kcal: props.item.kcal,
}))
const scaled = computed(() => scaleByGrams(per100.value, grams.value))

function pickTarget(t: MealTarget) {
  target.value = t
  pickingTarget.value = false
}

async function add() {
  if (grams.value <= 0) return
  await addEntry(props.item, props.date, target.value, grams.value, treat.value)
  emit('added')
}

// Своё править — продукт; продукт из базы — «моя версия» (этап 2.6).
// «Сохранить и добавить» сразу кладёт в дневник уже исправленный продукт с
// граммами из этого окна; просто «Сохранить» — закрываем, список за окном
// живой и уже показывает новое.
async function onFoodSaved(id: string, addNow: boolean) {
  editingFood.value = false
  const food = addNow ? await db.foods.get(id) : undefined
  if (food && grams.value > 0) {
    await addEntry(pickFromFood(food), props.date, target.value, grams.value, treat.value)
    emit('added')
  } else {
    emit('close')
  }
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
          <h2 class="text-base font-semibold text-ink">
            {{ item.name }}
          </h2>
          <p class="text-xs text-muted">
            на 100 г: Ж {{ per100.fat }} · У {{ per100.carbs }} · Б {{ per100.protein }} · {{ Math.round(per100.kcal) }} ккал
          </p>
        </div>
        <!-- Свой продукт — правка; продукт из базы — «моя версия» (этап 2.6) -->
        <button
          v-if="item.food || item.catalogId"
          type="button"
          aria-label="Изменить продукт"
          @click="editingFood = true"
          class="w-8 h-8 rounded-full flex items-center justify-center text-muted shrink-0"
        >
          <Pencil :size="16" />
        </button>
      </div>

      <div class="flex items-center gap-2 rounded-2xl glass px-4 py-3">
        <input
          v-model="gramsInput"
          type="text"
          inputmode="decimal"
          autofocus
          :placeholder="String(defaultGrams)"
          @focus="clearOnFocus"
          class="flex-1 text-2xl font-semibold text-ink bg-transparent outline-none"
        />
        <span class="text-sm text-muted">г</span>
      </div>

      <p class="text-sm text-muted">
        Ж {{ scaled.fat.toFixed(1) }} · У {{ scaled.carbs.toFixed(1) }} · Б {{ scaled.protein.toFixed(1) }} ·
        {{ Math.round(scaled.kcal) }} ккал
      </p>

      <label class="flex items-center gap-2 text-sm text-ink">
        <input v-model="treat" type="checkbox" class="h-4 w-4 accent-accent shrink-0" @change="touchTreat" />
        <TreatIcon :size="16" class="text-treat" />
        {{ TREAT_LABEL }}
      </label>

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
      :kind="item.food?.kind ?? 'product'"
      :food="item.food ?? undefined"
      :base="item.food ? undefined : item"
      @close="editingFood = false"
      @saved="onFoodSaved"
      @deleted="onFoodDeleted"
    />
  </div>
</template>
