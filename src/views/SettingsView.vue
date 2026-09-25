<script setup lang="ts">
// Цели — этап 4, токен Команды iOS — этап 5.
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { checkSession, logout, me } from '../lib/auth'
import { lastSyncError, pendingCount, runSync, syncing } from '../lib/sync'

const checking = ref(true)

onMounted(async () => {
  await checkSession()
  checking.value = false
  if (me.value) void runSync()
})
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

    <p class="mt-4 text-muted">Здесь будут цели и синхронизация тренировок.</p>
  </main>
</template>
