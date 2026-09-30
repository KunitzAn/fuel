<script setup lang="ts">
import { BarChart3, NotebookPen, Settings } from '@lucide/vue'
import { RouterLink, useRoute } from 'vue-router'

// Этап 8: у каждого раздела свой цвет (style.css) — и в меню, и как
// `--accent` внутри раздела (App.vue). Неактивные — тем же цветом, бледнее.
const tabs = [
  { to: '/', label: 'Дневник', icon: NotebookPen, color: 'var(--kcal)', match: (n: string) => n.startsWith('diary') },
  { to: '/stats', label: 'Статистика', icon: BarChart3, color: 'var(--protein)', match: (n: string) => n === 'stats' },
  { to: '/settings', label: 'Настройки', icon: Settings, color: 'var(--carbs)', match: (n: string) => n === 'settings' },
]
const route = useRoute()
</script>

<template>
  <nav class="fixed bottom-0 inset-x-0 z-30 glass !border-x-0 !border-b-0 pb-[env(safe-area-inset-bottom)]">
    <div class="mx-auto max-w-md flex items-center justify-around py-1.5">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-2xl transition-opacity"
        :class="tab.match(String(route.name)) ? '' : 'opacity-55'"
        :style="{
          color: tab.color,
          backgroundColor: tab.match(String(route.name)) ? `color-mix(in srgb, ${tab.color} 14%, transparent)` : undefined,
        }"
      >
        <component :is="tab.icon" :size="22" />
        <span class="text-[10px] leading-none font-medium">{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
