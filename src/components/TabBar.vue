<script setup lang="ts">
import { BarChart3, NotebookPen, Settings } from '@lucide/vue'
import { RouterLink } from 'vue-router'

const tabs = [
  { to: '/', label: 'Дневник', icon: NotebookPen },
  { to: '/stats', label: 'Статистика', icon: BarChart3 },
  { to: '/settings', label: 'Настройки', icon: Settings },
]
</script>

<template>
  <nav
    class="fixed bottom-0 inset-x-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
  >
    <div class="mx-auto max-w-md flex items-center justify-around py-1.5">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="flex flex-col items-center gap-0.5 px-4 py-1"
        :class="$route.path === tab.to ? 'text-accent' : 'text-muted'"
      >
        <component :is="tab.icon" :size="22" />
        <span class="text-[10px] leading-none">{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
