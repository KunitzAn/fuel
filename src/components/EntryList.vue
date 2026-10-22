<script setup lang="ts">
// Список записей внутри приёма/перекуса — общий для MealCard и SnackCard:
// тап по строке — правка граммов, свайп влево — мягкое удаление (SwipeRow)
// и 5 с «Отменить» внизу (lib/undo.ts).
import { ref } from 'vue'
import type { Entry } from '../lib/db'
import { restoreEntry, softDeleteEntry } from '../lib/diary'
import { scaleByGrams } from '../lib/nutrition'
import { withBrand } from '../lib/pick'
import { formatPieces } from '../lib/amount'
import { TreatIcon } from '../lib/treat'
import { offerUndo } from '../lib/undo'
import GramsEditSheet from './GramsEditSheet.vue'
import SwipeRow from './SwipeRow.vue'

defineProps<{ entries: Entry[] }>()

const editingEntry = ref<Entry | null>(null)

function entryTotal(entry: Entry) {
  return scaleByGrams(entry, entry.grams)
}

function remove(entry: Entry) {
  void softDeleteEntry(entry.id)
  offerUndo(`«${withBrand(entry.name, entry.brand)}» удалено`, () => restoreEntry(entry.id))
}
</script>

<template>
  <ul>
    <li v-if="entries.length === 0" class="px-4 py-3 text-sm text-muted">Ничего не добавлено</li>
    <SwipeRow
      v-for="entry in entries"
      :key="entry.id"
      tag="li"
      class="border-t border-line first:border-t-0"
      role="button"
      tabindex="0"
      @click="editingEntry = entry"
      @remove="remove(entry)"
    >
      <div class="px-4 py-2.5 active:bg-bg">
        <!-- Как в FatSecret (владелица): название; под ним граммы цветом
             приёма; под ними Ж · У · Б · ккал — просто числами, без «ккал» -->
        <div class="flex gap-3">
          <span class="flex-1 min-w-0 text-sm text-ink break-words">{{ withBrand(entry.name, entry.brand) }}</span>
          <!-- Вкусняшка — свой узкий столбец справа от названия (владелица) -->
          <span class="w-4 shrink-0 flex justify-center pt-0.5">
            <TreatIcon v-if="entry.treat" :size="15" class="text-treat" aria-label="Вкусняшка" />
          </span>
        </div>
        <!-- Штуками — «1 шт · 300 г», граммами — просто граммы -->
        <p class="mt-0.5 text-xs text-(--card-color)">
          <template v-if="entry.pieces">{{ formatPieces(entry.pieces) }} шт · </template>{{ entry.grams }} г
        </p>
        <!-- Те же столбцы, что в шапке приёма: сетка на 4 и справа место под
             шеврон (w-4 + gap-3), чтобы цифры стояли под цифрами -->
        <div class="flex gap-3 mt-1">
          <span class="flex-1 grid grid-cols-4 text-xs text-muted tabular-nums">
            <span>{{ entryTotal(entry).fat.toFixed(1) }}</span>
            <span>{{ entryTotal(entry).carbs.toFixed(1) }}</span>
            <span>{{ entryTotal(entry).protein.toFixed(1) }}</span>
            <span class="text-ink">{{ Math.round(entryTotal(entry).kcal) }}</span>
          </span>
          <span class="w-4 shrink-0" />
        </div>
      </div>
    </SwipeRow>
  </ul>

  <!-- В body: карточка приёма — «стекло» с backdrop-filter, а он делает её
       рамкой для position: fixed, и окно обрезалось бы внутри карточки
       (владелица: в перекусе окно граммов открывалось без поля граммов) -->
  <Teleport to="body">
    <GramsEditSheet v-if="editingEntry" :entry="editingEntry" @close="editingEntry = null" />
  </Teleport>
</template>
