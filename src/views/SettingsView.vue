<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getTokenStatus, issueToken, type TokenStatus } from '../lib/apiTokens'
import { checkSession, logout, me } from '../lib/auth'
import { formatDayShort, formatTime, todayLocalDate } from '../lib/date'
import { db } from '../lib/db'
import { saveGoalSettings } from '../lib/goalSettings'
import { replacedVersionDates, type GoalSettingsRange } from '../lib/goalSettingsPlan'
import { pickGoalSettingsForDate } from '../lib/goals'
import { kcalFromMacros, parseDecimal } from '../lib/nutrition'
import { lastSyncError, lastSyncReport, listPendingRows, pendingCount, runSync, syncing, type PendingRow } from '../lib/sync'
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
    void getTokenStatus()
      .then((s) => (tokenStatus.value = s))
      .catch(() => {})
  } else {
    goalsFormReady.value = true
  }
})

/**
 * Личный токен Команды iOS (этап 5, README «Синхронизация тренировок»).
 * Сырое значение сервер отдаёт только в ответ на «Выпустить новый» — дальше
 * храним только хэш, повторно показать нельзя, только «выпущен тогда-то».
 */
const tokenStatus = ref<TokenStatus | null>(null)
const issuedToken = ref<string | null>(null)
const issuingToken = ref(false)
const tokenCopied = ref(false)

async function handleIssueToken() {
  issuingToken.value = true
  issuedToken.value = null
  tokenCopied.value = false
  try {
    const { token, createdAt } = await issueToken()
    issuedToken.value = token
    tokenStatus.value = { exists: true, createdAt }
  } finally {
    issuingToken.value = false
  }
}

async function copyIssuedToken() {
  if (!issuedToken.value) return
  await navigator.clipboard.writeText(issuedToken.value)
  tokenCopied.value = true
  setTimeout(() => (tokenCopied.value = false), 2000)
}

// Статус Команды — по локальным данным из Здоровья: когда последний раз
// что-то пришло (отдельного лога синка на сервере нет и не нужно).
const healthRows = useLiveQuery(() => db.dailyActiveEnergy.filter((r) => r.deletedAt === null).toArray(), [])
const healthSyncStatus = computed(() => {
  const rows = healthRows.value
  if (rows.length === 0) return null
  const last = rows.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), rows[0]!.updatedAt)
  const lastDate = new Date(last).toDateString() === new Date().toDateString() ? 'сегодня' : new Date(last).toLocaleDateString('ru-RU')
  return `${lastDate} в ${formatTime(last)}`
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
const maxFollowsActivity = ref(false)

// Предзаполняем один раз, как только текущая версия действительно
// загрузилась — дальше это черновик формы, синк его не переписывает.
// null или undefined (старая локальная копия строки, закешированная до
// того, как в неё добавили новое поле миграцией — у неё этого поля в
// Dexie физически нет, а не null) — оставляем инпут пустым, не строкой
// «undefined» (владелица поймала это на мин/макс границах, 2026-09-28).
// `== null` ловит оба случая, `!= null` — «поле реально задано».
const toInput = (v: number | null | undefined) => (v == null ? '' : String(v))
watch(
  currentGoalSettings,
  (s) => {
    if (!s) return
    baseProteinInput.value = toInput(s.baseProtein)
    baseFatInput.value = toInput(s.baseFat)
    baseCarbsInput.value = toInput(s.baseCarbs)
    if (s.baseProtein != null && s.baseFat != null && s.baseCarbs != null) {
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
    maxFollowsActivity.value = s.maxFollowsActivity === true
    goalsEnabled.value = s.baseProtein != null
    dayTypeEnabled.value = s.highDeltaProtein != null || s.lowDeltaProtein != null
    boundsEnabled.value =
      s.minKcal != null ||
      s.maxKcal != null ||
      s.minProtein != null ||
      s.maxProtein != null ||
      s.minFat != null ||
      s.maxFat != null ||
      s.minCarbs != null ||
      s.maxCarbs != null
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

/**
 * Этап 4.6 (не из README, мысль владелицы): экран настроек был плоским
 * списком полей, непонятно, что можно включать/выключать по отдельности.
 * Три блока — «Цель», «Тип дня», «Мин/макс границы» — каждый со своим
 * чекбоксом. Чекбокс тут не отдельный флаг в БД (это по-прежнему просто
 * «заполнены поля или нет», как и раньше, см. `hasBaseGoal` и
 * `isDayTypeDeltaConfigured`/`computeDayBoundsStatus` в lib/goals.ts) —
 * это явное действие «включить/выключить» поверх той же механики:
 * включён = поля этого блока видны и участвуют в сохранении, выключен —
 * поля скрыты и очищены В ЧЕРНОВИКЕ формы (ничего не пишется в БД, пока
 * не нажата «Сохранить»); список галочек сразу показывает, какой набор
 * настроек вообще есть, вместо того чтобы гадать по списку полей.
 */
const goalsEnabled = ref(false)
const dayTypeEnabled = ref(false)
const boundsEnabled = ref(false)

function checkboxValue(e: Event): boolean {
  return (e.target as HTMLInputElement).checked
}

function toggleGoals(e: Event) {
  goalsEnabled.value = checkboxValue(e)
  if (!goalsEnabled.value) {
    baseProteinInput.value = ''
    baseFatInput.value = ''
    baseCarbsInput.value = ''
    baseKcalInput.value = ''
    restingKcalInput.value = ''
    perHundredProteinInput.value = ''
    perHundredFatInput.value = ''
    perHundredCarbsInput.value = ''
  }
}
function toggleDayType(e: Event) {
  dayTypeEnabled.value = checkboxValue(e)
  if (!dayTypeEnabled.value) {
    highDeltaProteinInput.value = ''
    highDeltaFatInput.value = ''
    highDeltaCarbsInput.value = ''
    lowDeltaProteinInput.value = ''
    lowDeltaFatInput.value = ''
    lowDeltaCarbsInput.value = ''
  }
}
function toggleBounds(e: Event) {
  boundsEnabled.value = checkboxValue(e)
  if (!boundsEnabled.value) {
    minKcalInput.value = ''
    maxKcalInput.value = ''
    minProteinInput.value = ''
    maxProteinInput.value = ''
    minFatInput.value = ''
    maxFatInput.value = ''
    minCarbsInput.value = ''
    maxCarbsInput.value = ''
    maxFollowsActivity.value = false
  }
}

// С какого дня действуют сохранённые настройки (владелица, после этапа 6):
// с сегодня (как раньше), с выбранной даты и дальше — или на период.
const applyMode = ref<'today' | 'from' | 'period'>('today')
const applyFrom = ref(todayLocalDate())
const applyTo = ref('')
const applyRange = computed<GoalSettingsRange | null>(() => {
  if (applyMode.value === 'today') return { from: todayLocalDate(), to: null }
  if (!applyFrom.value) return null
  if (applyMode.value === 'from') return { from: applyFrom.value, to: null }
  if (!applyTo.value || applyTo.value < applyFrom.value) return null
  return { from: applyFrom.value, to: applyTo.value }
})
const replacedDates = computed(() => (applyRange.value ? replacedVersionDates(goalRows.value, applyRange.value) : []))

// Диагностика «Ждут отправки» — что именно висит и чем кончился синк
const pendingOpen = ref(false)
const pendingRows = ref<PendingRow[]>([])
async function togglePending() {
  pendingOpen.value = !pendingOpen.value
  if (pendingOpen.value) pendingRows.value = await listPendingRows()
}
async function syncNow() {
  await runSync()
  pendingRows.value = await listPendingRows()
}

const kcalError = ref<string | null>(null)
const goalsSavedJustNow = ref(false)
async function saveGoals() {
  if (!goalsFormReady.value || !applyRange.value) return
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
    maxFollowsActivity: maxFollowsActivity.value,
  }, applyRange.value)
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
          <button v-if="pendingCount > 0 || lastSyncError" type="button" @click="togglePending" class="ml-1 text-accent underline underline-offset-2">
            {{ pendingOpen ? 'скрыть' : 'подробнее' }}
          </button>
        </p>
        <div v-if="pendingOpen" class="mt-2 rounded-xl bg-bg border border-line p-3 text-xs text-muted flex flex-col gap-1.5">
          <p v-if="lastSyncError">Ошибка: {{ lastSyncError }}</p>
          <p v-if="lastSyncReport">
            Последний синк в {{ formatTime(lastSyncReport.at) }}: отправлено {{ lastSyncReport.sent }}, сервер принял
            {{ lastSyncReport.accepted }}, прислал свою версию {{ lastSyncReport.taken }}
          </p>
          <ul class="flex flex-col gap-0.5">
            <li v-for="(r, i) in pendingRows" :key="i">{{ r.table }}: {{ r.label }} · изм. {{ r.updatedAt.slice(0, 16).replace('T', ' ') }}</li>
          </ul>
          <button type="button" @click="syncNow" class="self-start text-accent underline underline-offset-2">Отправить сейчас</button>
        </div>
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

    <!-- Этап 4.6 (не из README) — три независимых блока с чекбоксом на
         каждый, вместо одного плоского списка полей. Включение/выключение
         здесь — черновик формы, ничего не пишется в БД, пока не нажата
         «Сохранить» внизу; прошлые дни/версии эта правка не трогает
         (та же версионируемая история, что и раньше, см. 4.1). -->
    <section class="mt-3 rounded-2xl bg-card border border-line p-4 flex flex-col gap-3">
      <label class="flex items-start gap-2">
        <input type="checkbox" :checked="goalsEnabled" @change="toggleGoals" class="mt-0.5 h-4 w-4 accent-accent shrink-0" />
        <span>
          <span class="block text-sm font-semibold text-ink">Цель</span>
          <span class="block text-xs text-muted">Дневная норма Б/Ж/У и энергии покоя, растёт от активности.</span>
        </span>
      </label>

      <template v-if="goalsEnabled">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted">Цель по умолчанию (день без активности)</span>
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Жиры, г</span>
              <input v-model="baseFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Углеводы, г</span>
              <input v-model="baseCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Белки, г</span>
              <input v-model="baseProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
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
              <span class="text-xs text-muted">Ж, г</span>
              <input v-model="perHundredFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">У, г</span>
              <input v-model="perHundredCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Б, г</span>
              <input v-model="perHundredProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
          </div>
          <p class="text-xs text-muted">≈ {{ Math.round(perHundredKcalHint) }} ккал — подсказка, не входит в расчёт</p>
          <p class="text-xs text-muted">
            Считается только от тренировок и активностей, добавленных вручную. Активная энергия за весь день из Здоровья
            цель не поднимает — она идёт только в «Потрачено».
          </p>
        </div>

        <p class="text-xs text-muted">
          Прибавка от активности только положительная — цель не опускается ниже дефолтной. С какого дня действует изменение — выбирается внизу, у «Сохранить».
        </p>
      </template>
    </section>

    <section class="mt-3 rounded-2xl bg-card border border-line p-4 flex flex-col gap-3">
      <label class="flex items-start gap-2">
        <input type="checkbox" :checked="dayTypeEnabled" @change="toggleDayType" class="mt-0.5 h-4 w-4 accent-accent shrink-0" />
        <span>
          <span class="block text-sm font-semibold text-ink">Высоко-/низкоуглеводные дни</span>
          <span class="block text-xs text-muted">Поправка к цели на день, отмеченный высоко- или низкоуглеводным (план с утра, факт в конце дня — на странице дня).</span>
        </span>
      </label>

      <template v-if="dayTypeEnabled">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted">Высокоуглеводный день — прибавка к цели (вручную)</span>
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Ж, г</span>
              <input v-model="highDeltaFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">У, г</span>
              <input v-model="highDeltaCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Б, г</span>
              <input v-model="highDeltaProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted">Низкоуглеводный день — убавка от цели (вручную, вводить положительным числом)</span>
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Ж, г</span>
              <input v-model="lowDeltaFatInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">У, г</span>
              <input v-model="lowDeltaCarbsInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Б, г</span>
              <input v-model="lowDeltaProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
            </label>
          </div>
        </div>
        <p class="text-xs text-muted">
          При простановке типа дня можно будет выбрать: эти числа или среднее по факту прошлых дней такого же типа.
          Высокоуглеводный и низкоуглеводный настраиваются по отдельности — можно задать только один из двух. Тронули
          хоть одно поле своей тройки — остальные пустые в ней сохранятся нулями.
        </p>
      </template>
    </section>

    <section class="mt-3 rounded-2xl bg-card border border-line p-4 flex flex-col gap-3">
      <label class="flex items-start gap-2">
        <input type="checkbox" :checked="boundsEnabled" @change="toggleBounds" class="mt-0.5 h-4 w-4 accent-accent shrink-0" />
        <span>
          <span class="block text-sm font-semibold text-ink">Мин/макс границы</span>
          <span class="block text-xs text-muted">Подсветка на странице дня, если факт ещё не добрал до минимума или уже перебрал максимум — отдельно от цели, можно использовать и вместе с ней, и без неё.</span>
        </span>
      </label>

      <template v-if="boundsEnabled">
        <div class="grid grid-cols-2 gap-2">
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
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Белки, мин</span>
            <input v-model="minProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Белки, макс</span>
            <input v-model="maxProteinInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Ккал, мин</span>
            <input v-model="minKcalInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">Ккал, макс</span>
            <input v-model="maxKcalInput" type="text" inputmode="decimal" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
        <p class="text-xs text-muted">Каждая граница независима — можно задать только одну из восьми и не трогать остальные.</p>
        <label class="flex items-start gap-2">
          <input v-model="maxFollowsActivity" type="checkbox" class="mt-0.5 h-4 w-4 accent-accent shrink-0" />
          <span>
            <span class="block text-sm text-ink">Верхние границы растут с активностью</span>
            <span class="block text-xs text-muted">
              Потратили за день 500 ккал на активность — макс по калориям вырастет на 500. Макс по Б/Ж/У вырастет так
              же, как цель: по «на каждые 100 ккал активности» из блока «Цель» (если там не задано — не двигается).
              Минимумы не меняются.
            </span>
          </span>
        </label>
      </template>
    </section>

    <section class="mt-3 flex flex-col gap-2">
      <div class="rounded-2xl bg-card border border-line p-4 flex flex-col gap-3">
        <span class="text-sm font-semibold text-ink">Применить</span>
        <div class="flex gap-1 text-sm">
          <button
            v-for="m in [{ v: 'today', l: 'С сегодня' }, { v: 'from', l: 'С даты' }, { v: 'period', l: 'На период' }] as const"
            :key="m.v"
            type="button"
            @click="applyMode = m.v"
            class="flex-1 py-2 rounded-xl border"
            :class="applyMode === m.v ? 'bg-accent text-white border-accent' : 'border-line text-muted'"
          >
            {{ m.l }}
          </button>
        </div>
        <div v-if="applyMode !== 'today'" class="grid gap-2" :class="applyMode === 'period' ? 'grid-cols-2' : 'grid-cols-1'">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted">С</span>
            <input v-model="applyFrom" type="date" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label v-if="applyMode === 'period'" class="flex flex-col gap-1">
            <span class="text-xs text-muted">По (включительно)</span>
            <input v-model="applyTo" type="date" :min="applyFrom" class="rounded-2xl bg-bg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
        <p v-if="!applyRange" class="text-xs text-amber-600">Укажите даты: «по» не раньше «с».</p>
        <p v-else class="text-xs text-muted">
          Дни с {{ formatDayShort(applyRange.from) }}<template v-if="applyRange.to"> по {{ formatDayShort(applyRange.to) }}</template
          ><template v-else> и дальше</template> посчитаются по этим настройкам<template v-if="applyRange.to">, после — как было</template>.
          <template v-if="replacedDates.length">
            Заменит настройки, сохранённые с {{ replacedDates.map(formatDayShort).join(', ') }}.
          </template>
        </p>
      </div>
      <p v-if="!goalsFormReady" class="text-xs text-muted">Подтягиваю то, что уже настроено…</p>
      <button
        type="button"
        :disabled="!goalsFormReady || !applyRange"
        @click="saveGoals"
        class="rounded-2xl py-3 text-sm font-medium text-white bg-accent disabled:opacity-40"
      >
        {{ goalsSavedJustNow ? 'Сохранено' : 'Сохранить' }}
      </button>
      <p class="text-xs text-muted">
        Выключенный чекбокс выше — только черновик формы, ничего не стирается, пока не нажата «Сохранить». Дни до
        выбранной даты остаются со своими цифрами.
      </p>
    </section>

    <section v-if="me" class="mt-3 rounded-2xl bg-card border border-line p-4 flex flex-col gap-3">
      <h2 class="text-sm font-semibold text-ink">Активность из Здоровья (iPhone)</h2>
      <p class="text-xs text-muted">
        Сама по себе активность не подтягивается: сайты не видят приложение Здоровье, это ограничение Apple. Данные
        приходят только через Команду <code>Fuel</code> в приложении «Команды» — ей нужен личный токен ниже. Без
        неё активность можно добавлять вручную на странице дня («+ активность»).
      </p>

      <template v-if="issuedToken">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted">Токен (виден только сейчас — скопируйте в Команду)</span>
          <div class="flex items-center gap-2">
            <code class="flex-1 rounded-2xl bg-bg border border-line px-3 py-2.5 text-xs text-ink break-all">{{ issuedToken }}</code>
            <button type="button" @click="copyIssuedToken" class="rounded-2xl border border-line px-3 py-2.5 text-xs text-ink shrink-0">
              {{ tokenCopied ? 'Скопировано' : 'Копировать' }}
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <p class="text-xs text-muted">
          {{ tokenStatus?.exists ? `Токен выпущен (${new Date(tokenStatus.createdAt!).toLocaleDateString('ru-RU')}), сохранён как хэш — повторно показать нельзя.` : 'Токен ещё не выпущен.' }}
        </p>
      </template>
      <button
        type="button"
        :disabled="issuingToken"
        @click="handleIssueToken"
        class="rounded-2xl py-2.5 text-sm font-medium text-ink border border-line disabled:opacity-40"
      >
        {{ tokenStatus?.exists ? 'Выпустить новый (старый перестанет работать)' : 'Выпустить токен' }}
      </button>

      <p class="text-xs text-muted pt-2 border-t border-line">
        <template v-if="healthSyncStatus">Последние данные из Здоровья: {{ healthSyncStatus }}.</template>
        <template v-else>Данных из Здоровья ещё не было — Команда не настроена или ни разу не запускалась.</template>
      </p>
    </section>
  </main>
</template>
