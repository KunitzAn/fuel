import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { checkSession, me } from './lib/auth'
import { router } from './router'
import { installSyncTriggers, runSync } from './lib/sync'

async function bootstrap() {
  // Без сессии сеть не трогаем вообще — офлайн-старт остаётся мгновенным,
  // дневник и так пишется локально (см. lib/sync.ts).
  await checkSession().catch(() => {})
  if (me.value) {
    await runSync().catch(() => {})
  }

  createApp(App).use(router).mount('#app')
  installSyncTriggers()
}

void bootstrap()
