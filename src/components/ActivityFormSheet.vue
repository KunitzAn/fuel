<script setup lang="ts">
// Ручная активность — добавить/изменить/удалить (README «Цели и энергия»,
// PLAN.md этап 4.3). Название необязательно, ккал — обязательно.
import { computed, ref } from 'vue'
import type { Activity } from '../lib/db'
import { addActivity, softDeleteActivity, updateActivity } from '../lib/activities'
import { parseDecimal } from '../lib/nutrition'

const props = defineProps<{ date: string; activity?: Activity }>()
const emit = defineEmits<{ close: [] }>()

const isEdit = computed(() => !!props.activity)
const name = ref(props.activity?.name ?? '')
const kcalInput = ref(props.activity ? String(props.activity.kcal) : '')
const kcal = computed(() => parseDecimal(kcalInput.value))
const canSave = computed(() => kcal.value !== null && kcal.value > 0)

async function save() {
  if (kcal.value === null || kcal.value <= 0) return
  const draft = { name: name.value.trim() || null, kcal: kcal.value }
  if (props.activity) await updateActivity(props.activity.id, draft)
  else await addActivity(props.date, draft)
  emit('close')
}

async function remove() {
  if (!props.activity) return
  await softDeleteActivity(props.activity.id)
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center">
    <div class="absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="relative w-full max-w-md rounded-t-3xl bg-bg px-4 pt-5 pb-8 flex flex-col gap-4">
      <h2 class="text-base font-semibold text-ink">{{ isEdit ? 'Активность' : 'Новая активность' }}</h2>

      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted">Название (необязательно)</span>
        <input
          v-model="name"
          type="text"
          placeholder="Силовая, прогулка…"
          autofocus
          class="rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted">Ккал*</span>
        <input
          v-model="kcalInput"
          type="text"
          inputmode="decimal"
          class="rounded-2xl bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <div class="flex gap-2">
        <button type="button" @click="emit('close')" class="flex-1 rounded-2xl py-3 text-sm text-muted border border-line">
          Отмена
        </button>
        <button
          type="button"
          :disabled="!canSave"
          @click="save"
          class="flex-1 rounded-2xl py-3 text-sm font-medium text-white bg-accent disabled:opacity-40"
        >
          Сохранить
        </button>
      </div>
      <button v-if="isEdit" type="button" @click="remove" class="text-sm text-red-500">
        Удалить активность
      </button>
    </div>
  </div>
</template>
