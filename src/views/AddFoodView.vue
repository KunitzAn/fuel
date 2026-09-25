<script setup lang="ts">
// Заглушка до этапа 1.4: поиск по История/Продукты/Блюда/База и добавление
// в приём. Сейчас нужен только маршрут, чтобы ＋ на карточке приёма уже
// вёл куда-то.
import { ArrowLeft } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { MEAL_LABELS } from '../lib/diary'

const props = defineProps<{ date: string; meal: 'breakfast' | 'lunch' | 'dinner' }>()
const router = useRouter()
</script>

<template>
  <main class="min-h-dvh p-6 flex flex-col gap-4 bg-bg pt-[env(safe-area-inset-top)]">
    <header class="flex items-center gap-3">
      <button
        type="button"
        @click="router.back()"
        class="w-10 h-10 rounded-full bg-card border border-line flex items-center justify-center shrink-0"
      >
        <ArrowLeft :size="20" class="text-ink" />
      </button>
      <h1 class="text-lg font-semibold text-ink">{{ MEAL_LABELS[props.meal] }} · {{ props.date }}</h1>
    </header>
    <p class="text-sm text-muted">Поиск и добавление еды — этап 1.4.</p>
  </main>
</template>
