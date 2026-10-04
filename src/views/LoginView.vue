<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '../lib/api'
import { lastLoginEmail, requestLoginCode, verifyLoginCode } from '../lib/auth'
import { runSync } from '../lib/sync'

const router = useRouter()
const route = useRoute()

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
    // Сразу в дневник (владелица) — или туда, куда шли до входа
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    void router.replace(redirect)
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
      <!-- Без кнопки «назад»: без входа в приложении идти некуда (router.ts) -->
      <header class="pt-6 flex items-center gap-3">
        <img src="/apple-touch-icon.png" alt="" class="w-12 h-12 rounded-xl" />
        <h1 class="text-2xl font-bold text-ink">Fuel</h1>
      </header>

      <template v-if="step === 'email'">
        <p class="text-sm text-muted">
          Вход без пароля: пришлём код на почту, введёте его здесь.
        </p>
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
          @keyup.enter="submitEmail"
          class="rounded-2xl glass p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
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
        <p class="text-sm text-ink glass rounded-2xl p-4">
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
          class="rounded-2xl glass p-3 text-2xl text-center tracking-[0.3em] text-ink outline-none focus:ring-2 focus:ring-accent"
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
