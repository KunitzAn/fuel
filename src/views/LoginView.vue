<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../lib/api'
import { lastLoginEmail, requestLoginCode, verifyLoginCode } from '../lib/auth'
import { runSync } from '../lib/sync'

const router = useRouter()

// Почта прошлого входа на этом устройстве — сразу в поле, остаётся нажать «Прислать код».
const email = ref(lastLoginEmail())
const code = ref('')
const step = ref<'email' | 'code'>('email')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function submitEmail() {
  if (!email.value.trim()) return
  loading.value = true
  errorMessage.value = null
  try {
    await requestLoginCode(email.value.trim())
    step.value = 'code'
  } catch {
    errorMessage.value = 'Не получилось отправить письмо. Попробуйте ещё раз чуть позже.'
  } finally {
    loading.value = false
  }
}

async function submitCode() {
  if (!code.value.trim()) return
  loading.value = true
  errorMessage.value = null
  try {
    await verifyLoginCode(email.value.trim(), code.value.trim())
    void runSync()
    router.push('/settings')
  } catch (err) {
    errorMessage.value =
      err instanceof ApiError && err.status === 400
        ? 'Неверный или устаревший код. Проверьте письмо или запросите новый.'
        : 'Не получилось войти. Попробуйте ещё раз.'
  } finally {
    loading.value = false
  }
}

function resend() {
  step.value = 'email'
  code.value = ''
  errorMessage.value = null
}
</script>

<template>
  <main class="min-h-dvh p-6 flex justify-center bg-bg">
    <div class="w-full max-w-md flex flex-col gap-6 pt-[env(safe-area-inset-top)]">
      <header class="flex items-center gap-3">
        <button
          type="button"
          @click="router.push('/settings')"
          class="w-10 h-10 rounded-full bg-card border border-line flex items-center justify-center shrink-0"
        >
          <ArrowLeft :size="20" class="text-ink" />
        </button>
        <h1 class="text-lg font-semibold text-ink">Вход</h1>
      </header>

      <template v-if="step === 'email'">
        <p class="text-sm text-muted">
          Без пароля — пришлём код на почту, введёте его здесь. Пригодится, если открываете
          Fuel на новом устройстве.
        </p>
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
          @keyup.enter="submitEmail"
          class="rounded-2xl bg-card border border-line p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
        />
        <p v-if="errorMessage" class="text-sm text-red-500">{{ errorMessage }}</p>
        <button
          type="button"
          :disabled="!email.trim() || loading"
          @click="submitEmail"
          class="w-full rounded-2xl py-3 text-white font-medium bg-accent disabled:opacity-40"
        >
          {{ loading ? 'Отправляю…' : 'Прислать код' }}
        </button>
      </template>

      <template v-else>
        <p class="text-sm text-ink bg-card border border-line rounded-2xl p-4">
          Отправили код на <strong>{{ email }}</strong> — введите его ниже, действует 15 минут.
        </p>
        <input
          v-model="code"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          placeholder="000000"
          autocomplete="one-time-code"
          @keyup.enter="submitCode"
          class="rounded-2xl bg-card border border-line p-3 text-2xl text-center tracking-[0.3em] text-ink outline-none focus:ring-2 focus:ring-accent"
        />
        <p v-if="errorMessage" class="text-sm text-red-500">{{ errorMessage }}</p>
        <button
          type="button"
          :disabled="!code.trim() || loading"
          @click="submitCode"
          class="w-full rounded-2xl py-3 text-white font-medium bg-accent disabled:opacity-40"
        >
          {{ loading ? 'Проверяю…' : 'Войти' }}
        </button>
        <button type="button" @click="resend" class="text-sm text-muted">
          Отправить код ещё раз
        </button>
      </template>
    </div>
  </main>
</template>
