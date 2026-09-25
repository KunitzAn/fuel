<script setup lang="ts">
import { ChevronDown, Plus, Trash2 } from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Entry, Snack } from '../lib/db'
import { renameSnack, softDeleteSnack } from '../lib/diary'
import { scaleByGrams, sumMacros } from '../lib/nutrition'
import EntryList from './EntryList.vue'

const props = defineProps<{
  snack: Snack
  entries: Entry[]
  dayKcal: number
}>()

const expanded = ref(false)
const renaming = ref(false)
const nameDraft = ref(props.snack.name)
const nameInput = ref<HTMLInputElement | null>(null)

const totals = computed(() => sumMacros(props.entries.map((e) => scaleByGrams(e, e.grams))))
const sharePercent = computed(() =>
  props.dayKcal > 0 ? Math.round((totals.value.kcal / props.dayKcal) * 100) : 0,
)

async function startRename() {
  nameDraft.value = props.snack.name
  renaming.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function commitRename() {
  renaming.value = false
  if (nameDraft.value.trim() !== props.snack.name) void renameSnack(props.snack.id, nameDraft.value)
}

function remove() {
  void softDeleteSnack(props.snack.id)
}
</script>

<template>
  <section class="rounded-2xl bg-card border border-line overflow-hidden">
    <div class="flex items-center gap-2 px-4 pt-3">
      <input
        v-if="renaming"
        ref="nameInput"
        v-model="nameDraft"
        type="text"
        @blur="commitRename"
        @keyup.enter="commitRename"
        class="flex-1 text-sm font-semibold text-ink bg-transparent outline-none border-b border-accent"
      />
      <button v-else type="button" @click="startRename" class="text-sm font-semibold text-ink flex-1 text-left">
        {{ snack.name }}
      </button>
      <span class="text-sm text-muted">{{ Math.round(totals.kcal) }} ккал</span>
      <button
        type="button"
        aria-label="Удалить перекус"
        @click="remove"
        class="w-7 h-7 rounded-full flex items-center justify-center text-muted"
      >
        <Trash2 :size="16" />
      </button>
      <RouterLink
        :to="`/day/${snack.date}/snack/${snack.id}/add`"
        aria-label="Добавить"
        class="w-7 h-7 rounded-full flex items-center justify-center text-accent"
      >
        <Plus :size="18" />
      </RouterLink>
    </div>

    <button
      type="button"
      @click="expanded = !expanded"
      class="w-full flex items-center gap-3 px-4 py-2.5 text-left"
    >
      <span class="text-xs text-muted flex-1">
        <template v-if="entries.length">
          {{ totals.protein.toFixed(1) }} · {{ totals.fat.toFixed(1) }} · {{ totals.carbs.toFixed(1) }} ·
          {{ sharePercent }}%
        </template>
        <template v-else>Пусто</template>
      </span>
      <ChevronDown :size="16" class="text-muted transition-transform" :class="expanded ? 'rotate-180' : ''" />
    </button>

    <div v-if="expanded" class="border-t border-line">
      <EntryList :entries="entries" />
    </div>
  </section>
</template>
