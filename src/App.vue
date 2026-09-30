<script setup lang="ts">
import { watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import TabBar from './components/TabBar.vue'

const route = useRoute()

// Нет фирменного акцента (этап 8, см. style.css): `--accent` — цвет
// текущего раздела. Им красятся кнопки, активные вкладки и выбранный день.
const SECTION_COLOR: Record<string, string> = {
  stats: 'var(--protein)',
  settings: 'var(--carbs)',
}
watchEffect(() => {
  const color = SECTION_COLOR[String(route.name)] ?? 'var(--kcal)'
  document.documentElement.style.setProperty('--accent', color)
})
</script>

<template>
  <RouterView />
  <TabBar v-if="route.meta.tabBar" />
</template>
