<script setup lang="ts">
import { Apple, ChevronDown, Plus, Trash2 } from '@lucide/vue'
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

// Перекус с едой — удаляется вместе со всей едой в нём, поэтому
// спрашиваем (владелица); пустой — удаляем сразу, как раньше
function remove() {
  const n = props.entries.length
  if (n > 0 && !window.confirm(`Удалить «${props.snack.name}» и всю еду в нём (${n})?`)) return
  void softDeleteSnack(props.snack.id)
}
</script>

<template>
  <!-- overflow-clip, а не hidden: hidden делает карточку контейнером
       прокрутки, и прилипающая шапка ниже перестала бы липнуть к экрану -->
  <section class="rounded-3xl glass glow overflow-clip" style="--glow: var(--snack); --card-color: var(--snack)">
    <!-- Раскрытый приём прилипает шапкой под итогами дня, пока его список
         на экране (владелица: «если в нём много продуктов») -->
    <div
      :class="expanded ? 'sticky z-10 bg-card-solid glow border-b border-line' : ''"
      style="top: calc(env(safe-area-inset-top) + var(--day-header-h, 0px))"
    >
      <div class="flex items-center gap-2 px-4 pt-3">
        <!-- Одна общая иконка на все доп. приёмы (владелица), в том же кружке,
             что у завтрака/обеда/ужина -->
        <span class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-(--card-color)/15">
          <Apple :size="16" class="text-(--card-color)" />
        </span>
        <input
          v-if="renaming"
          ref="nameInput"
          v-model="nameDraft"
          type="text"
          @blur="commitRename"
          @keyup.enter="commitRename"
          class="flex-1 text-sm font-semibold text-ink bg-transparent outline-none border-b border-(--card-color)"
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
          class="w-7 h-7 rounded-full flex items-center justify-center text-(--card-color)"
        >
          <Plus :size="18" />
        </RouterLink>
      </div>

      <button
        type="button"
        @click="expanded = !expanded"
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left"
      >
        <!-- Ж · У · Б · доля ккал дня — крупно, как в FatSecret (владелица);
             порядок Ж У Б — её привычный -->
        <span v-if="entries.length" class="flex-1 grid grid-cols-4 text-[15px] text-ink tabular-nums">
          <span>{{ totals.fat.toFixed(1) }}</span>
          <span>{{ totals.carbs.toFixed(1) }}</span>
          <span>{{ totals.protein.toFixed(1) }}</span>
          <span>{{ sharePercent }}%</span>
        </span>
        <span v-else class="text-xs text-muted flex-1">Пусто</span>
        <ChevronDown :size="16" class="text-muted transition-transform" :class="expanded ? 'rotate-180' : ''" />
      </button>
    </div>

    <div v-if="expanded" class="border-t border-line">
      <EntryList :entries="entries" />
    </div>
  </section>
</template>
