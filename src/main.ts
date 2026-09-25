import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { installErrorOverlay, showError } from './lib/errorOverlay'
import { router } from './router'
import { installSyncTriggers, runSync } from './lib/sync'

installErrorOverlay()

// Монтируем сразу, сеть — фоном. Дневник целиком живёт в IndexedDB, для
// показа ему сервер не нужен. Раньше тут стоял await проверки сессии (как в
// daylens, где синк обязан был успеть до засева дефолтных категорий) — а на
// iOS в авиарежиме запрос не падает, а висит, и холодный старт офлайн
// навсегда застревал на заглушке с иконкой. Fuel ничего не засевает, ждать
// незачем. runSync сам проверит сессию и молча ничего не сделает без неё.
const app = createApp(App)
// Ошибки рендера Vue ловит сам и до window.onerror они не доходят — без
// этого сломанный экран был бы просто белым.
app.config.errorHandler = (err) => showError('vue', err)
router.onError((err) => showError('router', err))
app.use(router).mount('#app')
installSyncTriggers()
void runSync()
