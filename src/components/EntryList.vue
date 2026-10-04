<script setup lang="ts">
// Список записей внутри приёма/перекуса — общий для MealCard и SnackCard:
// тап по строке — правка граммов, свайп влево — мягкое удаление.
import { Trash2 } from '@lucide/vue'
import { reactive, ref } from 'vue'
import type { Entry } from '../lib/db'
import { restoreEntry, softDeleteEntry } from '../lib/diary'
import { scaleByGrams } from '../lib/nutrition'
import { withBrand } from '../lib/pick'
import { TreatIcon } from '../lib/treat'
import { offerUndo } from '../lib/undo'
import GramsEditSheet from './GramsEditSheet.vue'

defineProps<{ entries: Entry[] }>()

const editingEntry = ref<Entry | null>(null)

function entryTotal(entry: Entry) {
  return scaleByGrams(entry, entry.grams)
}

// Свайп (владелица, 04.10: «чуть провела — и еда пропала, можно даже не
// заметить»). Строка едет за пальцем, справа проступает красная полоса с
// корзиной. Удаляет, только если протащить дальше половины ширины строки;
// меньше — строка пружинит обратно. Удалённая строка уезжает влево и
// схлопывается, а внизу 5 с висит «Отменить» (lib/undo.ts).
const DELETE_FRACTION = 0.5
const AXIS_LOCK_PX = 8 // столько пальцу пройти, чтобы понять: свайп или прокрутка
const SLIDE_MS = 180
const COLLAPSE_MS = 200

// Одно состояние на список, привязка по id, а не замыкание на элемент —
// список сам может перерисоваться посреди жеста (докатился фоновый синк).
interface Drag {
  id: string
  x: number
  y: number
  width: number
  axis: 'x' | 'y' | null
  dx: number
}
const drag = ref<Drag | null>(null)
// Улетающие строки: id → на сколько сдвинуты (вся ширина)
const leaving = reactive(new Map<string, number>())
// После свайпа браузер ещё пришлёт click — не открывать окно граммов
let suppressClick = false

function dragging(id: string) {
  return drag.value?.id === id && drag.value.axis === 'x'
}
function offset(id: string): number {
  if (dragging(id)) return drag.value!.dx
  return leaving.get(id) ?? 0
}
function armed(id: string) {
  const d = drag.value
  return (!!d && dragging(id) && -d.dx > d.width * DELETE_FRACTION) || leaving.has(id)
}

function onTouchStart(e: TouchEvent, id: string) {
  const t = e.touches[0]
  if (!t || leaving.has(id)) return
  const width = (e.currentTarget as HTMLElement).offsetWidth
  drag.value = { id, x: t.clientX, y: t.clientY, width, axis: null, dx: 0 }
}

function onTouchMove(e: TouchEvent) {
  const d = drag.value
  const t = e.touches[0]
  if (!d || !t) return
  const dx = t.clientX - d.x
  const dy = t.clientY - d.y
  if (!d.axis) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return
    d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
  }
  if (d.axis !== 'x') return
  e.preventDefault()
  d.dx = Math.min(0, dx) // только влево
}

function onTouchEnd(e: TouchEvent, entry: Entry) {
  const d = drag.value
  drag.value = null
  if (!d || d.id !== entry.id || d.axis !== 'x') return
  suppressClick = true
  setTimeout(() => (suppressClick = false), 400)
  if (-d.dx > d.width * DELETE_FRACTION) remove(entry, e.currentTarget as HTMLElement, d.width)
  // иначе offset() вернёт 0, и строка с transition пружинит на место
}

function remove(entry: Entry, row: HTMLElement, width: number) {
  leaving.set(entry.id, -width - 24)
  setTimeout(() => {
    row.style.height = `${row.offsetHeight}px`
    row.style.transition = `height ${COLLAPSE_MS}ms ease`
    requestAnimationFrame(() => (row.style.height = '0px'))
    setTimeout(() => {
      leaving.delete(entry.id)
      void softDeleteEntry(entry.id)
      offerUndo(`«${withBrand(entry.name, entry.brand)}» удалено`, () => restoreEntry(entry.id))
    }, COLLAPSE_MS)
  }, SLIDE_MS)
}

function open(entry: Entry) {
  if (suppressClick || leaving.has(entry.id)) return
  editingEntry.value = entry
}
</script>

<template>
  <ul>
    <li v-if="entries.length === 0" class="px-4 py-3 text-sm text-muted">Ничего не добавлено</li>
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="relative overflow-hidden border-t border-line first:border-t-0"
      role="button"
      tabindex="0"
      @click="open(entry)"
      @touchstart="onTouchStart($event, entry.id)"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd($event, entry)"
      @touchcancel="drag = null"
    >
      <!-- Красная полоса под строкой — растёт вместе со сдвигом; дальше
           порога корзина крупнее и появляется «Удалить» -->
      <div
        class="absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 overflow-hidden bg-activity text-white"
        :class="dragging(entry.id) ? '' : 'transition-[width] ease-out'"
        :style="{ width: `${-offset(entry.id)}px`, transitionDuration: `${SLIDE_MS}ms` }"
      >
        <span class="flex items-center gap-1.5 pr-5 shrink-0">
          <span v-if="armed(entry.id)" class="text-sm font-medium">Удалить</span>
          <Trash2 :size="armed(entry.id) ? 20 : 17" class="transition-all" />
        </span>
      </div>

      <div
        class="px-4 py-2.5 active:bg-bg"
        :class="dragging(entry.id) ? '' : 'transition-transform ease-out'"
        :style="{ transform: `translateX(${offset(entry.id)}px)`, transitionDuration: `${SLIDE_MS}ms` }"
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
