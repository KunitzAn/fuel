<script setup lang="ts">
import { runUndo, undoState } from '../lib/undo'
</script>

<template>
  <Transition
    enter-from-class="opacity-0 translate-y-3"
    leave-to-class="opacity-0 translate-y-3"
    enter-active-class="transition duration-200"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="undoState"
      class="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      style="bottom: calc(env(safe-area-inset-bottom) + 5rem)"
    >
      <div
        role="status"
        class="pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-2xl bg-card-solid border border-line shadow-lg px-4 py-3"
      >
        <span class="flex-1 min-w-0 text-sm text-ink truncate">{{ undoState.message }}</span>
        <button type="button" @click="runUndo" class="text-sm font-semibold text-accent shrink-0">Отменить</button>
      </div>
    </div>
  </Transition>
</template>
