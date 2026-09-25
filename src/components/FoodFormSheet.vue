<script setup lang="ts">
// Форма продукта/блюда — и создание, и правка (README «Форма продукта» /
// «Форма блюда» + правка по обратной связи). Полноэкранная, а не шторка
// снизу — полей слишком много для шторки.
import { ArrowLeft } from '@lucide/vue'
import { computed, ref } from 'vue'
import type { Food } from '../lib/db'
import {
  createFood,
  kcalFromMacros,
  macrosExceed100,
  macrosPer100FromForm,
  parseDecimal,
  softDeleteFood,
  updateFood,
} from '../lib/foods'

const props = defineProps<{ kind: 'product' | 'dish'; food?: Food }>()
const emit = defineEmits<{ close: []; saved: [foodId: string, addNow: boolean]; deleted: [] }>()

const isEdit = computed(() => !!props.food)

const name = ref(props.food?.name ?? '')
const brand = ref(props.food?.brand ?? '')
const barcode = ref(props.food?.barcode ?? '')
const note = ref(props.food?.note ?? '')
// Хранится всегда на 100 г — при правке нет смысла угадывать, вводили ли
// когда-то «на порцию», просто показываем уже пересчитанное.
const servingMode = ref<'per100' | 'perServing'>('per100')
const servingGramsInput = ref('')
const proteinInput = ref(props.food ? String(props.food.protein) : '')
const fatInput = ref(props.food ? String(props.food.fat) : '')
const carbsInput = ref(props.food ? String(props.food.carbs) : '')
const kcalInput = ref(props.food ? String(props.food.kcal) : '')

const servingGrams = computed(() => parseDecimal(servingGramsInput.value) ?? 0)
const protein = computed(() => parseDecimal(proteinInput.value) ?? 0)
const fat = computed(() => parseDecimal(fatInput.value) ?? 0)
const carbs = computed(() => parseDecimal(carbsInput.value) ?? 0)

// То, что реально уйдёт в базу — всегда на 100 г, даже если вводили на порцию.
const per100 = computed(() =>
  macrosPer100FromForm(servingMode.value, servingGrams.value, protein.value, fat.value, carbs.value),
)
const computedKcal = computed(() => kcalFromMacros(per100.value.protein, per100.value.fat, per100.value.carbs))

const enteredKcal = computed(() => parseDecimal(kcalInput.value))
const exceeds100 = computed(() => macrosExceed100(per100.value.protein, per100.value.fat, per100.value.carbs))
const kcalMismatch = computed(() => {
  if (enteredKcal.value === null || computedKcal.value === 0) return null
  const diff = Math.abs(enteredKcal.value - computedKcal.value) / computedKcal.value
  return diff > 0.1 ? Math.round(computedKcal.value) : null
})

// Без названия и БЖУ сохранить нельзя — ккал единственное необязательное,
// оно и так считается само.
const canSave = computed(
  () =>
    name.value.trim().length > 0 &&
    parseDecimal(proteinInput.value) !== null &&
    parseDecimal(fatInput.value) !== null &&
    parseDecimal(carbsInput.value) !== null,
)

function fillKcalFromMacros() {
  kcalInput.value = String(Math.round(computedKcal.value))
}

async function save(addNow: boolean) {
  if (!canSave.value) return
  const kcal = enteredKcal.value ?? computedKcal.value
  const draft = {
    kind: props.kind,
    name: name.value.trim(),
    brand: props.kind === 'product' && brand.value.trim() ? brand.value.trim() : null,
    barcode: props.kind === 'product' && barcode.value.trim() ? barcode.value.trim() : null,
    protein: per100.value.protein,
    fat: per100.value.fat,
    carbs: per100.value.carbs,
    kcal,
    note: props.kind === 'dish' && note.value.trim() ? note.value.trim() : null,
  }
  let id: string
  if (props.food) {
    id = props.food.id
    await updateFood(id, draft)
  } else {
    id = await createFood(draft)
  }
  emit('saved', id, addNow)
}

// Мягкое удаление: прошлые записи хранят свой снимок КБЖУ и не зависят от
// этой строки — из истории/статистики ничего не пропадает (README «Правка
// и удаление»), пропадает только сам продукт/блюдо из будущих Продуктов/Блюд.
async function remove() {
  if (!props.food) return
  await softDeleteFood(props.food.id)
  emit('deleted')
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-bg flex flex-col">
    <header class="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
      <button type="button" @click="emit('close')" class="w-9 h-9 flex items-center justify-center text-ink">
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-lg font-semibold text-ink">
        {{ isEdit ? (kind === 'product' ? 'Продукт' : 'Блюдо') : kind === 'product' ? 'Новый продукт' : 'Новое блюдо' }}
      </h1>
    </header>

    <div class="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-4">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted">Название*</span>
        <input v-model="name" type="text" class="rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
      </label>

      <label v-if="kind === 'product'" class="flex flex-col gap-1">
        <span class="text-xs text-muted">Марка</span>
        <input v-model="brand" type="text" class="rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
      </label>

      <label v-if="kind === 'product'" class="flex flex-col gap-1">
        <span class="text-xs text-muted">Штрихкод</span>
        <!-- Сканер — этап 3, пока только ручной ввод -->
        <input v-model="barcode" type="text" inputmode="numeric" class="rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
      </label>

      <div v-if="kind === 'product'" class="flex flex-col gap-1">
        <span class="text-xs text-muted">КБЖУ указаны</span>
        <div class="flex gap-2">
          <button type="button" @click="servingMode = 'per100'" class="flex-1 rounded-2xl py-2.5 text-sm border" :class="servingMode === 'per100' ? 'bg-accent text-white border-accent' : 'bg-card border-line text-ink'">
            на 100 г
          </button>
          <button type="button" @click="servingMode = 'perServing'" class="flex-1 rounded-2xl py-2.5 text-sm border" :class="servingMode === 'perServing' ? 'bg-accent text-white border-accent' : 'bg-card border-line text-ink'">
            на порцию
          </button>
        </div>
        <!-- Азиатские этикетки часто пишут «Serving size 30 g» — вбиваем как есть, храним на 100 г -->
        <input
          v-if="servingMode === 'perServing'"
          v-model="servingGramsInput"
          type="text"
          inputmode="decimal"
          placeholder="Граммы порции"
          class="mt-1 rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div class="grid grid-cols-3 gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted">Белки*</span>
          <input v-model="proteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-card border border-line px-3 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted">Жиры*</span>
          <input v-model="fatInput" type="text" inputmode="decimal" class="rounded-2xl bg-card border border-line px-3 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted">Углеводы*</span>
          <input v-model="carbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-card border border-line px-3 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
        </label>
      </div>
      <p v-if="exceeds100" class="text-xs text-amber-600">Б + Ж + У получается больше 100 г на 100 г — проверьте, не опечатка ли</p>

      <div class="flex items-end gap-2">
        <label class="flex-1 flex flex-col gap-1">
          <span class="text-xs text-muted">Ккал</span>
          <input v-model="kcalInput" type="text" inputmode="decimal" :placeholder="String(Math.round(computedKcal))" class="rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <button type="button" @click="fillKcalFromMacros" class="rounded-2xl border border-line px-3 py-3 text-xs text-ink shrink-0">
          = из БЖУ
        </button>
      </div>
      <p v-if="kcalMismatch !== null" class="text-xs text-muted -mt-2">По БЖУ выходит {{ kcalMismatch }} — не ошибка, просто на всякий случай</p>

      <label v-if="kind === 'dish'" class="flex flex-col gap-1">
        <span class="text-xs text-muted">Заметка (из чего и в каких пропорциях — в расчётах не участвует)</span>
        <textarea v-model="note" rows="3" class="rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent resize-none" />
      </label>

      <button v-if="isEdit" type="button" @click="remove" class="text-sm text-red-500 text-left">
        Удалить {{ kind === 'product' ? 'продукт' : 'блюдо' }}
      </button>
    </div>

    <div class="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 flex gap-2 border-t border-line bg-bg">
      <button type="button" :disabled="!canSave" @click="save(false)" class="flex-1 rounded-2xl py-3 text-sm font-medium text-ink border border-line disabled:opacity-40">
        Сохранить
      </button>
      <button type="button" :disabled="!canSave" @click="save(true)" class="flex-1 rounded-2xl py-3 text-sm font-medium text-white bg-accent disabled:opacity-40">
        Сохранить и добавить
      </button>
    </div>
  </div>
</template>
