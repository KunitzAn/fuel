<script setup lang="ts">
// Карточка энергии (README «Главный экран»): потрачено, разница, список
// активностей дня, ручное добавление. ⟳ — запускает Команду iOS (этап 5),
// подтягивает тренировки; сам pull делает общий триггер visibilitychange
// (src/lib/sync.ts) при возврате в приложение, отдельно вызывать не нужно.
import { ChevronDown, Flame, RefreshCw } from '@lucide/vue'
import { computed, ref } from 'vue'
import type { Activity, DailyActiveEnergy } from '../lib/db'
import type { DayGoal } from '../lib/goals'
import ActivityFormSheet from './ActivityFormSheet.vue'

const props = defineProps<{
  date: string
  activities: Activity[] // уже отфильтрованы по этому дню
  goal: DayGoal | null // null — цели ещё не настроены (README «без настроек»)
  eatenKcal: number
  // Этап 5: энергия за день из Здоровья (Команда iOS). Активная уже
  // сложена с ручными в `goal` (goals.ts → dayActivityKcal), здесь — только
  // показать её строкой в списке. Покой — только для просмотра.
  dailyActiveEnergy: DailyActiveEnergy | null
}>()

const healthActiveKcal = computed(() => props.dailyActiveEnergy?.totalActiveKcal ?? null)

const expanded = ref(false)
const editingActivity = ref<Activity | 'new' | null>(null)

const difference = computed(() => (props.goal ? props.eatenKcal - props.goal.spentKcal : null))
const differenceLabel = computed(() => {
  if (difference.value === null) return ''
  const rounded = Math.round(difference.value)
  return rounded > 0 ? `+${rounded}` : String(rounded)
})

function runShortcut() {
  window.location.href = 'shortcuts://run-shortcut?name=Fuel'
}
</script>

<template>
  <section class="rounded-2xl bg-card border border-line overflow-hidden">
    <div class="flex items-center gap-2 px-4 pt-3">
      <Flame :size="16" class="text-accent shrink-0" />
      <h3 v-if="goal" class="text-sm text-ink flex-1">
        Потрачено {{ Math.round(goal.spentKcal) }} · Разница {{ differenceLabel }}
      </h3>
      <h3 v-else class="text-sm text-ink flex-1">Активность</h3>
      <button type="button" @click="runShortcut" aria-label="Подтянуть тренировки" class="w-7 h-7 rounded-full flex items-center justify-center text-ink shrink-0">
        <RefreshCw :size="16" />
      </button>
    </div>

    <button type="button" @click="expanded = !expanded" class="w-full flex items-center gap-3 px-4 py-2.5 text-left">
      <span class="text-xs text-muted flex-1">
        <template v-if="activities.length">{{ activities.length }} {{ activities.length === 1 ? 'активность' : 'активности' }}</template>
        <template v-if="activities.length && healthActiveKcal !== null"> · </template>
        <template v-if="healthActiveKcal !== null">Здоровье {{ Math.round(healthActiveKcal) }} ккал</template>
        <template v-if="!activities.length && healthActiveKcal === null">Активностей нет</template>
      </span>
      <ChevronDown :size="16" class="text-muted transition-transform" :class="expanded ? 'rotate-180' : ''" />
    </button>

    <template v-if="expanded">
      <ul class="border-t border-line">
        <!-- Приходит из Команды iOS, в приложении не правится — без тапа -->
        <li v-if="healthActiveKcal !== null" class="flex items-center gap-3 px-4 py-2.5">
          <span class="flex-1 text-sm text-ink truncate">Активная энергия (Здоровье)</span>
          <span class="text-xs text-muted shrink-0">
            {{ Math.round(healthActiveKcal) }} ккал
            <template v-if="dailyActiveEnergy?.restingKcal != null">· покой {{ Math.round(dailyActiveEnergy.restingKcal) }}</template>
          </span>
        </li>
        <li
          v-for="activity in activities"
          :key="activity.id"
          role="button"
          tabindex="0"
          @click="editingActivity = activity"
          class="flex items-center gap-3 px-4 py-2.5 border-t border-line first:border-t-0 active:bg-bg"
        >
          <span class="flex-1 text-sm text-ink truncate">{{ activity.name ?? 'Активность' }}</span>
          <span class="text-xs text-muted shrink-0">
            {{ Math.round(activity.kcal) }} ккал
            <template v-if="activity.totalKcal !== null">· полных {{ Math.round(activity.totalKcal) }}</template>
          </span>
        </li>
      </ul>
      <button type="button" @click="editingActivity = 'new'" class="w-full text-left px-4 py-2.5 text-sm text-accent border-t border-line">
        + активность
      </button>
    </template>

    <ActivityFormSheet
      v-if="editingActivity"
      :date="date"
      :activity="editingActivity === 'new' ? undefined : editingActivity"
      @close="editingActivity = null"
    />
  </section>
</template>
