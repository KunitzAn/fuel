import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { installSyncTriggers, runSync } from './lib/sync'

// Монтируем сразу, сеть — фоном. Дневник целиком живёт в IndexedDB, для
// показа ему сервер не нужен. Раньше тут стоял await проверки сессии (как в
// daylens, где синк обязан был успеть до засева дефолтных категорий) — а на
// iOS в авиарежиме запрос не падает, а висит, и холодный старт офлайн
// навсегда застревал на заглушке с иконкой. Fuel ничего не засевает, ждать
// незачем. runSync сам проверит сессию и молча ничего не сделает без неё.
createApp(App).use(router).mount('#app')
installSyncTriggers()
void runSync()
