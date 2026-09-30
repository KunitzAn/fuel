<script setup lang="ts">
import { watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import TabBar from './components/TabBar.vue'

const route = useRoute()

// Нет фирменного акцента (этап 8, см. style.css): `--accent` — цвет
// текущего раздела. Им красятся кнопки, активные вкладки и выбранный день.
// Дневник — розовый, как углеводы (владелица заменила зелёный на розовый:
// выбранный день, точки дней с записями, чипы «План/Факт»); калории и
// «Дневник» в меню при этом остаются зелёными.
const SECTION_COLOR: Record<string, string> = {
  stats: 'var(--protein)',
}
watchEffect(() => {
  const color = SECTION_COLOR[String(route.name)] ?? 'var(--carbs)'
  document.documentElement.style.setProperty('--accent', color)
})
</script>

<template>
  <RouterView />
  <TabBar v-if="route.meta.tabBar" />
</template>
