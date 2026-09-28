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

// Сохранение целей всегда пишет ПОЛНый новый снимок (versioning, см. ниже) —
// если форма ещё не успела подтянуть текущую версию с сервера (свежий
// логин на новом устройстве, до первого синка), «Сохранить» могло бы
// молча стереть уже настроенное. Ждём первую попытку синка перед тем, как
// разрешить сохранять; без сети/входа ждать нечего — сразу готово.
const goalsFormReady = ref(false)

onMounted(async () => {
  await checkSession()
  checking.value = false
  if (me.value) {
    void runSync().finally(() => {
      goalsFormReady.value = true
    })
  } else {
    goalsFormReady.value = true
  }
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
const baseKcalInput = ref('') // не хранится отдельно — только сверка с БЖУ при сохранении
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
// Мин/макс границы (этап 4.5) — отдельная фича от цели, своя пара границ
// на все дни. Каждое из восьми полей независимо от остальных (не триада
// Б/Ж/У, как у цели/типа дня — группировкой resolveGroup не нужна)
const minKcalInput = ref('')
const maxKcalInput = ref('')
const minProteinInput = ref('')
const maxProteinInput = ref('')
const minFatInput = ref('')
const maxFatInput = ref('')
const minCarbsInput = ref('')
const maxCarbsInput = ref('')

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
    if (s.baseProtein !== null && s.baseFat !== null && s.baseCarbs !== null) {
      baseKcalInput.value = String(Math.round(kcalFromMacros(s.baseProtein, s.baseFat, s.baseCarbs)))
    }
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
    minKcalInput.value = toInput(s.minKcal)
    maxKcalInput.value = toInput(s.maxKcal)
    minProteinInput.value = toInput(s.minProtein)
    maxProteinInput.value = toInput(s.maxProtein)
    minFatInput.value = toInput(s.minFat)
    maxFatInput.value = toInput(s.maxFat)
    minCarbsInput.value = toInput(s.minCarbs)
    maxCarbsInput.value = toInput(s.maxCarbs)
  },
  { once: true },
)

// null, если хоть одно из трёх пусто/не число — посчитать не из чего.
const baseKcalFromMacros = computed(() => {
  const p = parseDecimal(baseProteinInput.value)
  const f = parseDecimal(baseFatInput.value)
  const c = parseDecimal(baseCarbsInput.value)
  return p !== null && f !== null && c !== null ? kcalFromMacros(p, f, c) : null
})
// Автоподстановка — только пока поле пустое (владелица: «должны
// автоматом подставляться, но можно их изменить»): правка руками не
// перетирается следующим же вводом в Б/Ж/У, только явной кнопкой ниже.
watch(baseKcalFromMacros, (kcal) => {
  if (kcal !== null && baseKcalInput.value.trim() === '') baseKcalInput.value = String(Math.round(kcal))
})
function fillBaseKcalFromMacros() {
  if (baseKcalFromMacros.value !== null) baseKcalInput.value = String(Math.round(baseKcalFromMacros.value))
}

const perHundredKcalHint = computed(() =>
  kcalFromMacros(
    parseDecimal(perHundredProteinInput.value) ?? 0,
    parseDecimal(perHundredFatInput.value) ?? 0,
    parseDecimal(perHundredCarbsInput.value) ?? 0,
  ),
)

/**
 * Группа из нескольких полей (база Б/Ж/У/покой; high или low Б/Ж/У) —
 * тронула хоть одно, остальные пустые в группе достраиваются нулями, а не
 * гасят всю группу целиком (владелица: «если указать только 2 из 3 — в 3
 * автоматом 0»). Совсем пустая группа (ничего не тронуто) — так и
 * остаётся пустой: это и есть «не настроено» (`hasBaseGoal`,
 * `isDayTypeDeltaConfigured` в lib/goals.ts).
 */
function resolveGroup(inputs: string[]): (number | null)[] {
  const parsed = inputs.map(parseDecimal)
  if (parsed.every((v) => v === null)) return parsed
  return parsed.map((v) => v ?? 0)
}

const kcalError = ref<string | null>(null)
const goalsSavedJustNow = ref(false)
async function saveGoals() {
  if (!goalsFormReady.value) return
  kcalError.value = null
  const [baseProtein, baseFat, baseCarbs, restingKcal] = resolveGroup([
    baseProteinInput.value,
    baseFatInput.value,
    baseCarbsInput.value,
    restingKcalInput.value,
  ])
  const [highDeltaProtein, highDeltaFat, highDeltaCarbs] = resolveGroup([
    highDeltaProteinInput.value,
    highDeltaFatInput.value,
    highDeltaCarbsInput.value,
  ])
  const [lowDeltaProtein, lowDeltaFat, lowDeltaCarbs] = resolveGroup([
    lowDeltaProteinInput.value,
    lowDeltaFatInput.value,
    lowDeltaCarbsInput.value,
  ])

  // Ккал нигде не хранится — везде считается из БЖУ (README «Калории из
  // БЖУ»); поле здесь только для проверки, что сама не ошиблась в цифрах.
  if (baseProtein !== null) {
    const expected = kcalFromMacros(baseProtein, baseFat!, baseCarbs!)
    const entered = parseDecimal(baseKcalInput.value)
    if (entered !== null && Math.round(entered) !== Math.round(expected)) {
      kcalError.value = `Не сходится с БЖУ — по ним выходит ${Math.round(expected)} ккал`
      return
    }
  }

  await saveGoalSettings({
    baseProtein,
    baseFat,
    baseCarbs,
    restingKcal,
    perHundredProtein: parseDecimal(perHundredProteinInput.value) ?? 0,
    perHundredFat: parseDecimal(perHundredFatInput.value) ?? 0,
    perHundredCarbs: parseDecimal(perHundredCarbsInput.value) ?? 0,
    highDeltaProtein,
    highDeltaFat,
    highDeltaCarbs,
    lowDeltaProtein,
    lowDeltaFat,
    lowDeltaCarbs,
    minKcal: parseDecimal(minKcalInput.value),
    maxKcal: parseDecimal(maxKcalInput.value),
    minProtein: parseDecimal(minProteinInput.value),
    maxProtein: parseDecimal(maxProteinInput.value),
    minFat: parseDecimal(minFatInput.value),
    maxFat: parseDecimal(maxFatInput.value),
    minCarbs: parseDecimal(minCarbsInput.value),
    maxCarbs: parseDecimal(maxCarbsInput.value),
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
        <div class="flex items-end gap-2">
          <label class="flex-1 flex flex-col gap-1">
            <span class="text-xs text-muted">Ккал</span>
            <input
              v-model="baseKcalInput"
              type="text"
              inputmode="decimal"
              placeholder="Подставится из БЖУ"
              class="rounded-2xl bg-bg border border-line px-4 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <button type="button" @click="fillBaseKcalFromMacros" class="rounded-2xl border border-line px-3 py-2.5 text-xs text-ink shrink-0">
            = из БЖУ
          </button>
        </div>
        <p v-if="kcalError" class="text-xs text-red-500">{{ kcalError }}</p>
        <p v-else class="text-xs text-muted">
          {{ baseKcalFromMacros !== null ? 'Подставляется само, пока не начала печатать своё' : 'Необязательно — совсем не заполнено, цели дня не будет' }}
        </p>
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
        Всё здесь необязательно. Тронули хоть одно поле в группе (базовая цель, high, low — по отдельности) — остальные
        пустые в ней сохранятся нулями; не тронули ни одного — вся группа так и останется не настроенной, не мешая
        другим. Прошлые дни, где что-то уже было настроено, в статистике не меняются.
      </p>

      <div class="flex flex-col gap-3 pt-2 border-t border-line">
        <h3 class="text-sm font-semibold text-ink">Мин/макс границы</h3>
        <p class="text-xs text-muted">
          Своя фича, отдельная от цели — можно использовать и вместе с целью, и без неё. Подсветка в дневнике по ходу
          дня, если факт ещё не добрал до минимума или уже перебрал максимум. Каждая граница независима: можно задать
          только одну из восьми и не трогать остальные.
        </p>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Ккал, мин</span>
            <input v-model="minKcalInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Ккал, макс</span>
            <input v-model="maxKcalInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Белки, мин</span>
            <input v-model="minProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Белки, макс</span>
            <input v-model="maxProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Жиры, мин</span>
            <input v-model="minFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Жиры, макс</span>
            <input v-model="maxFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Углеводы, мин</span>
            <input v-model="minCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Углеводы, макс</span>
            <input v-model="maxCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
      </div>

      <p v-if="!goalsFormReady" class="text-xs text-muted">Подтягиваю то, что уже настроено…</p>
      <button
        type="button"
        :disabled="!goalsFormReady"
        @click="saveGoals"
        class="rounded-2xl py-3 text-sm font-medium text-white bg-accent disabled:opacity-40"
      >
        {{ goalsSavedJustNow ? 'Сохранено' : 'Сохранить' }}
      </button>
    </section>

    <p class="mt-4 text-muted">Здесь будет синхронизация тренировок (этап 5).</p>
  </main>
</template>
