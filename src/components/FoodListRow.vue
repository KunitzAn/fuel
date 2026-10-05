<script setup lang="ts">
// Строка в Истории/Продуктах/Блюдах/Базе: тап — открыть окно граммов,
// ＋ — добавить сразу с прошлыми граммами, без окна (README «Добавление
// еды»). `added` — уже добавлен «+» за этот заход на экран: галочка рядом,
// «+» остаётся — можно положить ещё раз.
import { Check, Plus } from '@lucide/vue'

defineProps<{
  title: string
  trailing?: string
  added?: boolean
}>()
const emit = defineEmits<{ open: []; add: [] }>()
</script>

<template>
  <div
    role="button"
    tabindex="0"
    @click="emit('open')"
    class="flex items-center gap-3 px-4 py-2.5 border-t border-line first:border-t-0 active:bg-bg"
  >
    <span class="flex-1 min-w-0 text-sm text-ink break-words">
      {{ title }}
    </span>
    <span v-if="trailing" class="text-xs text-muted shrink-0">{{ trailing }}</span>
    <Check v-if="added" :size="16" class="text-kcal shrink-0" aria-label="Добавлено" />
    <button
      type="button"
      aria-label="Добавить"
      @click.stop="emit('add')"
      class="w-7 h-7 rounded-full flex items-center justify-center text-accent shrink-0"
    >
      <Plus :size="18" />
    </button>
  </div>
</template>
