<script setup lang="ts">
// Токен Команды iOS — этап 5.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { checkSession, logout, me } from '../lib/auth'
import { todayLocalDate } from '../lib/date'
import { db } from '../lib/db'
import { saveGoalSettings } from '../lib/goalSettings'
import { pickGoalSettingsForDate } from '../lib/goals'
import { kcalFromMacros, parseDecimal } from '../lib/nutrition'
import { lastSyncError, pendingCount, runSync, syncing } from '../lib/sync'
import { useLiveQuery } from '../lib/useLiveQuery'

// Если сессия уже известна — показываем сразу, не ждём сети (без неё на
// iOS проверка может висеть до таймаута).
const checking = ref(!me.value)

onMounted(async () => {
  await checkSession()
  checking.value = false
  if (me.value) void runSync()
})

// Офлайн-копия готова, когда страницей управляет service worker — он
// активируется только скачав всё приложение целиком. Пока не готова,
// выключать интернет и перезапускать приложение бесполезно: iOS пойдёт в
// сеть и покажет свою ошибку.
const offlineReady = ref(false)
if ('serviceWorker' in navigator) {
  offlineReady.value = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    offlineReady.value = !!navigator.serviceWorker.controller
  })
}

// Цели (этап 4.1, README «Цели и энергия»). Версия, действующая сегодня —
// источник для предзаполнения формы; сохранение всегда создаёт новую
// версию (goalSettings.ts), эта не трогается.
const goalRows = useLiveQuery(() => db.goalSettings.filter((g) => g.deletedAt === null).toArray(), [])
const currentGoalSettings = computed(() => pickGoalSettingsForDate(goalRows.value, todayLocalDate()))

const baseProteinInput = ref('')
const baseFatInput = ref('')
const baseCarbsInput = ref('')
const restingKcalInput = ref('')
const perHundredProteinInput = ref('')
const perHundredFatInput = ref('')
const perHundredCarbsInput = ref('')
// Поправка для типа дня (этап 4.4) — та же версия, что и база
const highDeltaProteinInput = ref('')
const highDeltaFatInput = ref('')
const highDeltaCarbsInput = ref('')
const lowDeltaProteinInput = ref('')
const lowDeltaFatInput = ref('')
const lowDeltaCarbsInput = ref('')

// Предзаполняем один раз, как только текущая версия действительно
// загрузилась — дальше это черновик формы, синк его не переписывает.
// null — поле не было заполнено, оставляем инпут пустым, а не «null» строкой.
const toInput = (v: number | null) => (v !== null ? String(v) : '')
watch(
  currentGoalSettings,
  (s) => {
    if (!s) return
    baseProteinInput.value = toInput(s.baseProtein)
    baseFatInput.value = toInput(s.baseFat)
    baseCarbsInput.value = toInput(s.baseCarbs)
    restingKcalInput.value = toInput(s.restingKcal)
    perHundredProteinInput.value = toInput(s.perHundredProtein)
    perHundredFatInput.value = toInput(s.perHundredFat)
    perHundredCarbsInput.value = toInput(s.perHundredCarbs)
    highDeltaProteinInput.value = toInput(s.highDeltaProtein)
    highDeltaFatInput.value = toInput(s.highDeltaFat)
    highDeltaCarbsInput.value = toInput(s.highDeltaCarbs)
    lowDeltaProteinInput.value = toInput(s.lowDeltaProtein)
    lowDeltaFatInput.value = toInput(s.lowDeltaFat)
    lowDeltaCarbsInput.value = toInput(s.lowDeltaCarbs)
  },
  { once: true },
)

// null, если хоть одно из трёх пусто/не число — «= … ккал» тогда не про
// что показывать (не 0 — 0 выглядел бы как настоящая цель в 0 г).
const baseKcal = computed(() => {
  const p = parseDecimal(baseProteinInput.value)
  const f = parseDecimal(baseFatInput.value)
  const c = parseDecimal(baseCarbsInput.value)
  return p !== null && f !== null && c !== null ? kcalFromMacros(p, f, c) : null
})
const perHundredKcalHint = computed(() =>
  kcalFromMacros(
    parseDecimal(perHundredProteinInput.value) ?? 0,
    parseDecimal(perHundredFatInput.value) ?? 0,
    parseDecimal(perHundredCarbsInput.value) ?? 0,
  ),
)

// Все поля необязательные (владелица: «это все необязательные настройки») —
// пустое поле сохраняется как null, не блокирует сохранение остальных.
// Пусто целиком по группе (база, high, low) — эта часть просто не
// используется дальше (src/lib/goals.ts: hasBaseGoal, isDayTypeDeltaConfigured).
const goalsSavedJustNow = ref(false)
async function saveGoals() {
  await saveGoalSettings({
    baseProtein: parseDecimal(baseProteinInput.value),
    baseFat: parseDecimal(baseFatInput.value),
    baseCarbs: parseDecimal(baseCarbsInput.value),
    restingKcal: parseDecimal(restingKcalInput.value),
    perHundredProtein: parseDecimal(perHundredProteinInput.value),
    perHundredFat: parseDecimal(perHundredFatInput.value),
    perHundredCarbs: parseDecimal(perHundredCarbsInput.value),
    highDeltaProtein: parseDecimal(highDeltaProteinInput.value),
    highDeltaFat: parseDecimal(highDeltaFatInput.value),
    highDeltaCarbs: parseDecimal(highDeltaCarbsInput.value),
    lowDeltaProtein: parseDecimal(lowDeltaProteinInput.value),
    lowDeltaFat: parseDecimal(lowDeltaFatInput.value),
    lowDeltaCarbs: parseDecimal(lowDeltaCarbsInput.value),
  })
  goalsSavedJustNow.value = true
  setTimeout(() => (goalsSavedJustNow.value = false), 2000)
}
</script>

<template>
  <main class="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-24">
    <h1 class="text-2xl font-bold">Настройки</h1>

    <section class="mt-6 rounded-2xl bg-card border border-line p-4">
      <template v-if="checking">
        <p class="text-sm text-muted">Проверяю вход…</p>
      </template>
      <template v-else-if="me">
        <p class="text-sm text-ink">Вошли как <strong>{{ me.email }}</strong></p>
        <p class="mt-1 text-xs text-muted">
          <template v-if="syncing">Синхронизация…</template>
          <template v-else-if="lastSyncError">Синк не удался, попробую снова</template>
          <template v-else-if="pendingCount > 0">Ждут отправки: {{ pendingCount }}</template>
          <template v-else>Синхронизировано</template>
        </p>
        <button
          type="button"
          @click="logout"
          class="mt-3 text-sm text-muted underline underline-offset-2"
        >
          Выйти
        </button>
      </template>
      <template v-else>
        <p class="text-sm text-muted">Не вошли — дневник пишется локально, без синка между устройствами.</p>
        <RouterLink
          to="/login"
          class="mt-3 inline-block text-sm text-accent underline underline-offset-2"
        >
          Войти по коду с почты
        </RouterLink>
      </template>
    </section>

    <section class="mt-3 rounded-2xl bg-card border border-line p-4">
      <p class="text-sm text-ink">
        Офлайн-режим:
        <strong :class="offlineReady ? 'text-green-600' : 'text-amber-600'">
          {{ offlineReady ? 'готов' : 'ещё загружается' }}
        </strong>
      </p>
      <p v-if="!offlineReady" class="mt-1 text-xs text-muted">
        Подержите приложение открытым с интернетом, пока статус не сменится на «готов».
      </p>
    </section>

    <section class="mt-3 rounded-2xl bg-card border border-line p-4 flex flex-col gap-4">
      <h2 class="text-sm font-semibold text-ink">Цели</h2>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted">Цель по умолчанию (день без активности)</span>
        <div class="grid grid-cols-3 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Белки, г</span>
            <input v-model="baseProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Жиры, г</span>
            <input v-model="baseFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Углеводы, г</span>
            <input v-model="baseCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
        <p class="text-xs text-muted">{{ baseKcal !== null ? `= ${Math.round(baseKcal)} ккал, считается из БЖУ` : 'Необязательно — не заполнено, цель дня не будет показываться' }}</p>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted">Энергия покоя, ккал</span>
        <input v-model="restingKcalInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-4 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
      </label>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted">На каждые 100 ккал активности — прибавка к цели</span>
        <div class="grid grid-cols-3 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Б, г</span>
            <input v-model="perHundredProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Ж, г</span>
            <input v-model="perHundredFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">У, г</span>
            <input v-model="perHundredCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
        <p class="text-xs text-muted">≈ {{ Math.round(perHundredKcalHint) }} ккал — подсказка, не входит в расчёт</p>
      </div>

      <p class="text-xs text-muted">
        Прибавка от активности только положительная — цель не опускается ниже дефолтной. Изменение действует с сегодняшнего дня, прошлые дни остаются со своими цифрами.
      </p>

      <div class="flex flex-col gap-1 pt-2 border-t border-line">
        <span class="text-xs text-muted">Высокоуглеводный день — прибавка к цели (вручную)</span>
        <div class="grid grid-cols-3 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Б, г</span>
            <input v-model="highDeltaProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Ж, г</span>
            <input v-model="highDeltaFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">У, г</span>
            <input v-model="highDeltaCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted">Низкоуглеводный день — убавка от цели (вручную, вводить положительным числом)</span>
        <div class="grid grid-cols-3 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Б, г</span>
            <input v-model="lowDeltaProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Ж, г</span>
            <input v-model="lowDeltaFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">У, г</span>
            <input v-model="lowDeltaCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
      </div>
      <p class="text-xs text-muted">
        При простановке типа дня можно будет выбрать: эти числа или среднее по факту прошлых дней такого же типа.
        Всё здесь необязательно — пустое поле просто выключает соответствующую часть (высоко- или низкоуглеводные дни
        по отдельности, саму цель целиком), не мешая остальному. Прошлые дни, где что-то уже было настроено, в
        статистике не меняются.
      </p>

      <button type="button" @click="saveGoals" class="rounded-2xl py-3 text-sm font-medium text-white bg-accent">
        {{ goalsSavedJustNow ? 'Сохранено' : 'Сохранить' }}
      </button>
    </section>

    <p class="mt-4 text-muted">Здесь будет синхронизация тренировок (этап 5).</p>
  </main>
</template>
