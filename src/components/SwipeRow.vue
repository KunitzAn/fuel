<script setup lang="ts">
// Строка, которую смахивают влево, чтобы убрать: еда в дневнике (EntryList)
// и строки Истории на экране добавления. Строка едет за пальцем, справа
// проступает красная полоса с корзиной. Срабатывает, только если протащить
// дальше половины ширины; меньше — строка пружинит обратно (владелица,
// 04.10: «чуть провела — и еда пропала»). Потом строка уезжает влево,
// схлопывается, и только тогда — `remove`; «Отменить» показывает родитель.
import { Trash2 } from '@lucide/vue'
import { ref } from 'vue'

withDefaults(defineProps<{ tag?: string; label?: string }>(), { tag: 'div', label: 'Удалить' })
const emit = defineEmits<{ remove: [] }>()

const DELETE_FRACTION = 0.5
const AXIS_LOCK_PX = 8 // столько пальцу пройти, чтобы понять: свайп или прокрутка
const SLIDE_MS = 180
const COLLAPSE_MS = 200

interface Drag {
  x: number
  y: number
  width: number
  axis: 'x' | 'y' | null
  dx: number
}
const drag = ref<Drag | null>(null)
// Улетает: на сколько сдвинута (вся ширина); null — стоит на месте
const leaving = ref<number | null>(null)
// После свайпа браузер ещё пришлёт click — он не должен открыть строку
let suppressClick = false

const dragging = () => drag.value?.axis === 'x'
const offset = () => (dragging() ? drag.value!.dx : (leaving.value ?? 0))
const armed = () => (dragging() && -drag.value!.dx > drag.value!.width * DELETE_FRACTION) || leaving.value !== null

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  if (!t || leaving.value !== null) return
  drag.value = { x: t.clientX, y: t.clientY, width: (e.currentTarget as HTMLElement).offsetWidth, axis: null, dx: 0 }
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

function onTouchEnd(e: TouchEvent) {
  const d = drag.value
  drag.value = null
  if (!d || d.axis !== 'x') return
  suppressClick = true
  setTimeout(() => (suppressClick = false), 400)
  if (-d.dx <= d.width * DELETE_FRACTION) return // offset() вернёт 0 — строка с transition пружинит на место
  const row = e.currentTarget as HTMLElement
  leaving.value = -d.width - 24
  setTimeout(() => {
    row.style.height = `${row.offsetHeight}px`
    row.style.transition = `height ${COLLAPSE_MS}ms ease`
    requestAnimationFrame(() => (row.style.height = '0px'))
    setTimeout(() => {
      emit('remove')
      // Родитель обычно тут же убирает строку из списка. Если нет (убрать не
      // вышло) — возвращаем её на место, а не оставляем схлопнутой
      setTimeout(() => {
        leaving.value = null
        row.style.height = ''
        row.style.transition = ''
      }, 600)
    }, COLLAPSE_MS)
  }, SLIDE_MS)
}

function onClickCapture(e: MouseEvent) {
  if (!suppressClick && leaving.value === null) return
  e.stopPropagation()
  e.preventDefault()
}
</script>

<template>
  <component
    :is="tag"
    class="relative overflow-hidden"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="drag = null"
    @click.capture="onClickCapture"
  >
    <!-- Красная полоса под строкой — растёт вместе со сдвигом; дальше порога
         корзина крупнее и появляется подпись -->
    <div
      class="absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden bg-activity text-white"
      :class="dragging() ? '' : 'transition-[width] ease-out'"
      :style="{ width: `${-offset()}px`, transitionDuration: `${SLIDE_MS}ms` }"
    >
      <span class="flex items-center gap-1.5 pr-5 shrink-0">
        <span v-if="armed()" class="text-sm font-medium">{{ label }}</span>
        <Trash2 :size="armed() ? 20 : 17" class="transition-all" />
      </span>
    </div>

    <div
      :class="dragging() ? '' : 'transition-transform ease-out'"
      :style="{ transform: offset() ? `translateX(${offset()}px)` : undefined, transitionDuration: `${SLIDE_MS}ms` }"
    >
      <slot />
    </div>
  </component>
</template>
