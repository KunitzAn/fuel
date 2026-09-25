<script setup lang="ts">
// Строка в Истории/Продуктах/Блюдах/Базе: тап — открыть, ＋ — добавить
// сразу с прошлыми граммами, без окна (README «Добавление еды»).
// В режиме множественного выбора (по обратной связи, не из README) —
// чекбокс вместо ＋, тап по строке отмечает/снимает отметку, а не
// открывает окно; у отмеченной строки есть свой инпут граммов.
import { Plus } from '@lucide/vue'

const props = defineProps<{
  title: string
  subtitle?: string | null
  trailing?: string
  selectable?: boolean
  selected?: boolean
  grams?: number
}>()
const emit = defineEmits<{ open: []; add: []; toggle: []; 'update:grams': [number] }>()

function onRowClick() {
  if (props.selectable) emit('toggle')
  else emit('open')
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    @click="onRowClick"
    class="flex items-center gap-3 px-4 py-2.5 border-t border-line first:border-t-0 active:bg-bg"
  >
    <input
      v-if="selectable"
      type="checkbox"
      :checked="selected"
      @click.stop="emit('toggle')"
      class="w-4 h-4 accent-[var(--accent)] shrink-0"
    />
    <span class="flex-1 text-sm text-ink truncate">
      {{ title }}<span v-if="subtitle" class="text-muted"> · {{ subtitle }}</span>
    </span>
    <span v-if="trailing" class="text-xs text-muted shrink-0">{{ trailing }}</span>

    <template v-if="selectable">
      <div v-if="selected" class="flex items-center gap-1 shrink-0" @click.stop>
        <input
          type="text"
          inputmode="decimal"
          :value="grams"
          @input="emit('update:grams', Number(($event.target as HTMLInputElement).value) || 0)"
          class="w-12 rounded-lg bg-bg border border-line px-1.5 py-1 text-xs text-ink text-right outline-none"
        />
        <span class="text-xs text-muted">г</span>
      </div>
    </template>
    <button
      v-else
      type="button"
      aria-label="Добавить"
      @click.stop="$emit('add')"
      class="w-7 h-7 rounded-full flex items-center justify-center text-accent shrink-0"
    >
      <Plus :size="18" />
    </button>
  </div>
</template>
