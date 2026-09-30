<script setup lang="ts">
// Статистика (этап 6, README «Статистика»): две вкладки — Лента │ Графики.
// Всё считается локально из Dexie теми же функциями, что и дневник
// (lib/stats.ts → goals.ts), офлайн работает так же.
import { computed, ref } from 'vue'
import StatsCharts from '../components/StatsCharts.vue'
import StatsFeed from '../components/StatsFeed.vue'
import { todayLocalDate } from '../lib/date'
import { db } from '../lib/db'
import { createDaySummarizer, earliestEntryDate } from '../lib/stats'
import { useLiveQuery } from '../lib/useLiveQuery'

const today = todayLocalDate()
const tab = ref<'feed' | 'charts'>('feed')

const entries = useLiveQuery(() => db.entries.filter((e) => e.deletedAt === null).toArray(), [])
const activities = useLiveQuery(() => db.activities.filter((a) => a.deletedAt === null).toArray(), [])
const health = useLiveQuery(() => db.dailyActiveEnergy.filter((r) => r.deletedAt === null).toArray(), [])
const goalSettings = useLiveQuery(() => db.goalSettings.filter((g) => g.deletedAt === null).toArray(), [])
const dayTypes = useLiveQuery(() => db.dayTypes.filter((d) => d.deletedAt === null).toArray(), [])

const summarize = computed(() =>
  createDaySummarizer({
    entries: entries.value,
    activities: activities.value,
    health: health.value,
    goalSettings: goalSettings.value,
    dayTypes: dayTypes.value,
  }),
)
const earliest = computed(() => earliestEntryDate(entries.value))
</script>

<template>
  <main class="mx-auto max-w-md px-4 pb-24">
    <!-- Липкий верх целиком (заголовок, вкладки и шапка ленты) — так шапка
         ленты не уезжает под статус-бар iPhone и не нужно подбирать отступ -->
    <div class="sticky top-0 z-10 bg-bg pt-[calc(env(safe-area-inset-top)+1rem)]">
      <h1 class="text-2xl font-bold">Статистика</h1>
      <div class="mt-3 flex gap-1 text-sm">
        <button type="button" @click="tab = 'feed'" class="flex-1 py-2 rounded-xl" :class="tab === 'feed' ? 'bg-accent text-white' : 'text-muted'">Лента</button>
        <button type="button" @click="tab = 'charts'" class="flex-1 py-2 rounded-xl" :class="tab === 'charts' ? 'bg-accent text-white' : 'text-muted'">Графики</button>
      </div>
      <div
        v-if="tab === 'feed'"
        class="mt-2 grid grid-cols-[2.75rem_repeat(6,minmax(0,1fr))] gap-x-1 py-2 text-[11px] text-muted text-right border-b border-line"
      >
        <span class="text-left">День</span>
        <span>Б, г</span>
        <span>Ж, г</span>
        <span>У, г</span>
        <span>Ккал</span>
        <span>Потр.</span>
        <span>Разн.</span>
      </div>
    </div>

    <StatsFeed v-if="tab === 'feed'" :today="today" :earliest="earliest" :summarize="summarize" />
    <StatsCharts v-else :today="today" :summarize="summarize" />
  </main>
</template>
