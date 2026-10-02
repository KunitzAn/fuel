<script setup lang="ts">
// Список записей внутри приёма/перекуса — общий для MealCard и SnackCard:
// тап по строке — правка граммов, свайп — мягкое удаление.
import { ref } from 'vue'
import type { Entry } from '../lib/db'
import { softDeleteEntry } from '../lib/diary'
import { scaleByGrams } from '../lib/nutrition'
import { withBrand } from '../lib/pick'
import { TreatIcon } from '../lib/treat'
import GramsEditSheet from './GramsEditSheet.vue'

defineProps<{ entries: Entry[] }>()

const SWIPE_THRESHOLD = 80
const editingEntry = ref<Entry | null>(null)

function entryTotal(entry: Entry) {
  return scaleByGrams(entry, entry.grams)
}

function deleteEntry(entry: Entry) {
  void softDeleteEntry(entry.id)
}

// Одно поле состояния на список, привязка по id, а не замыкание на
// элемент — список сам может перерисоваться посреди жеста (например,
// докатился фоновый синк), и тогда замыкание, созданное на момент
// touchstart, было бы уже не тем, что получит touchend.
const swipeStart = ref<{ id: string; x: number; y: number } | null>(null)

function onTouchStart(e: TouchEvent, id: string) {
  const t = e.touches[0]
  if (!t) return
  swipeStart.value = { id, x: t.clientX, y: t.clientY }
}

function onTouchMove(e: TouchEvent) {
  const start = swipeStart.value
  const t = e.touches[0]
  if (!start || !t) return
  if (Math.abs(t.clientX - start.x) > Math.abs(t.clientY - start.y)) e.preventDefault()
}

function onTouchEnd(e: TouchEvent, entry: Entry) {
  const start = swipeStart.value
  swipeStart.value = null
  if (!start || start.id !== entry.id) return
  const t = e.changedTouches[0]
  if (!t) return
  const dx = t.clientX - start.x
  const dy = t.clientY - start.y
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return
  deleteEntry(entry)
}
</script>

<template>
  <ul>
    <li v-if="entries.length === 0" class="px-4 py-3 text-sm text-muted">Ничего не добавлено</li>
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="px-4 py-2.5 border-t border-line first:border-t-0 active:bg-bg"
      role="button"
      tabindex="0"
      @click="editingEntry = entry"
      @touchstart="onTouchStart($event, entry.id)"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd($event, entry)"
    >
      <!-- Как в FatSecret (владелица): название; под ним граммы цветом
           приёма; под ними Ж · У · Б · ккал — просто числами, без «ккал» -->
      <div class="flex gap-3">
        <span class="flex-1 min-w-0 text-sm text-ink break-words">{{ withBrand(entry.name, entry.brand) }}</span>
        <!-- Вкусняшка — свой узкий столбец справа от названия (владелица) -->
        <span class="w-4 shrink-0 flex justify-center pt-0.5">
          <TreatIcon v-if="entry.treat" :size="15" class="text-treat" aria-label="Вкусняшка" />
        </span>
      </div>
      <p class="mt-0.5 text-xs text-(--card-color)">{{ entry.grams }} г</p>
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
    </li>
  </ul>

  <!-- В body: карточка приёма — «стекло» с backdrop-filter, а он делает её
       рамкой для position: fixed, и окно обрезалось бы внутри карточки
       (владелица: в перекусе окно граммов открывалось без поля граммов) -->
  <Teleport to="body">
    <GramsEditSheet v-if="editingEntry" :entry="editingEntry" @close="editingEntry = null" />
  </Teleport>
</template>
