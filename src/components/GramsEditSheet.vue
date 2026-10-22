<script setup lang="ts">
// Правка граммов существующей записи (README: «Тап по еде — правка
// граммов»). Полноценное окно ввода граммов для НОВОЙ записи — этап 1.5,
// у него будет и подстановка «граммы с прошлого раза», и выбор приёма.
import { Pencil } from '@lucide/vue'
import { computed, ref } from 'vue'
import AmountField from './AmountField.vue'
import FoodFormSheet from './FoodFormSheet.vue'
import { withBrand } from '../lib/pick'
import { TREAT_LABEL, TreatIcon } from '../lib/treat'
import { db, type Entry, type Food } from '../lib/db'
import { softDeleteEntry, updateEntryGrams } from '../lib/diary'
import { useAmount } from '../lib/amount'
import { setPieceGrams } from '../lib/foods'
import { scaleByGrams } from '../lib/nutrition'
import { pickFromEntry, type PickItem } from '../lib/pick'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ close: [] }>()

// Правка/удаление самого продукта — не этой записи. Правка продукта
// переписывает и эту запись (foods.ts → updateFood), а `entry` здесь —
// снимок на момент открытия окна, поэтому после сохранения закрываем окно
// целиком: дневник за ним живой и уже показывает новые цифры.
// Запись из базы (catalogId) — карандаш ведёт к «моей версии» (этап 2.6),
// а если она уже есть — к её правке, а не к ещё одной копии.
const editing = ref<{ food?: Food; base?: PickItem } | null>(null)
async function openFoodEdit() {
  const { foodId, catalogId } = props.entry
  const food = foodId
    ? await db.foods.get(foodId)
    : catalogId
      ? await db.foods.filter((f) => f.sourceCatalogId === catalogId && !f.deletedAt).first()
      : undefined
  if (food) editing.value = { food }
  else if (catalogId) editing.value = { base: pickFromEntry(props.entry, new Map())! }
}
function closeAll() {
  editing.value = null
  emit('close')
}

// Граммами или штуками (lib/amount.ts) — как была добавлена запись. Тап
// по полю очищает его (владелица: не стирать 42 руками перед вводом нового
// числа); прежнее значение — подсказкой, «Сохранить» без ввода ничего не
// меняет. Вес штуки — тот, что был у этой записи; добавлена граммами —
// подставим вес штуки из продукта, если он есть.
const amount = useAmount({
  grams: props.entry.grams,
  pieces: props.entry.pieces ?? null,
  pieceGrams: props.entry.pieces ? props.entry.grams / props.entry.pieces : null,
})
const grams = computed(() => amount.grams)
if (!props.entry.pieces && props.entry.foodId) {
  void db.foods.get(props.entry.foodId).then((f) => {
    if (f?.pieceGrams) amount.knowPieceGrams(f.pieceGrams)
  })
}

const per100 = computed(() => ({
  protein: props.entry.protein,
  fat: props.entry.fat,
  carbs: props.entry.carbs,
  kcal: props.entry.kcal,
}))
const scaled = computed(() => scaleByGrams(per100.value, grams.value))

// Отметка «не основная еда» (lib/treat.ts) — сохраняется той же кнопкой
const treat = ref(props.entry.treat === true)

async function save() {
  if (grams.value <= 0) return
  // Вписали/поменяли вес штуки — запоминаем у своего продукта (у продукта
  // из базы — только для этой записи)
  if (amount.newPieceGrams !== null && props.entry.foodId) {
    const food = await db.foods.get(props.entry.foodId)
    if (food && !food.deletedAt) await setPieceGrams(food.id, amount.newPieceGrams)
  }
  await updateEntryGrams(props.entry.id, grams.value, treat.value, amount.entryPieces)
  emit('close')
}

// Кнопка-дублёр свайпа: свайп пока без анимации, поэтому не всем очевиден
// (см. PLAN.md, этап 8) — а окно уже открыто тапом, так что удалить отсюда
// логично, не обязательно уходить искать строку снова.
async function remove() {
  await softDeleteEntry(props.entry.id)
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="relative w-full max-w-md rounded-t-3xl bg-bg px-4 pt-5 pb-8 flex flex-col gap-4">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-ink">{{ withBrand(entry.name, entry.brand) }}</h2>
          <p class="text-xs text-muted">
            на 100 г: Ж {{ per100.fat }} · У {{ per100.carbs }} · Б {{ per100.protein }} · {{ Math.round(per100.kcal) }} ккал
          </p>
        </div>
        <button
          v-if="entry.foodId || entry.catalogId"
          type="button"
          aria-label="Изменить продукт"
          @click="openFoodEdit"
          class="w-8 h-8 rounded-full flex items-center justify-center text-muted shrink-0"
        >
          <Pencil :size="16" />
        </button>
      </div>

      <AmountField :amount="amount" />

      <p class="text-sm text-muted">
        Ж {{ scaled.fat.toFixed(1) }} · У {{ scaled.carbs.toFixed(1) }} · Б {{ scaled.protein.toFixed(1) }} ·
        {{ Math.round(scaled.kcal) }} ккал
      </p>

      <label class="flex items-center gap-2 text-sm text-ink">
        <input v-model="treat" type="checkbox" class="h-4 w-4 accent-accent shrink-0" />
        <TreatIcon :size="16" class="text-treat" />
        {{ TREAT_LABEL }}
      </label>

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
      <button type="button" @click="remove" class="text-sm text-red-500">
        Удалить запись
      </button>
    </div>

    <FoodFormSheet
      v-if="editing"
      :kind="editing.food?.kind ?? 'product'"
      :food="editing.food"
      :base="editing.base"
      @close="editing = null"
      @saved="closeAll"
      @deleted="closeAll"
    />
  </div>
</template>
