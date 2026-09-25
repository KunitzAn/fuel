<script setup lang="ts">
// Строка в Истории/Продуктах/Блюдах/Базе: тап — открыть, ＋ — добавить
// сразу с прошлыми граммами, без окна (README «Добавление еды»).
import { Plus } from '@lucide/vue'

defineProps<{ title: string; subtitle?: string | null; trailing?: string }>()
defineEmits<{ open: []; add: [] }>()
</script>

<template>
  <div
    role="button"
    tabindex="0"
    @click="$emit('open')"
    class="flex items-center gap-3 px-4 py-2.5 border-t border-line first:border-t-0 active:bg-bg"
  >
    <span class="flex-1 text-sm text-ink truncate">
      {{ title }}<span v-if="subtitle" class="text-muted"> · {{ subtitle }}</span>
    </span>
    <span v-if="trailing" class="text-xs text-muted shrink-0">{{ trailing }}</span>
    <button
      type="button"
      aria-label="Добавить"
      @click.stop="$emit('add')"
      class="w-7 h-7 rounded-full flex items-center justify-center text-accent shrink-0"
    >
      <Plus :size="18" />
    </button>
  </div>
</template>
