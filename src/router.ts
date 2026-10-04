import { watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { checkSession, me, signedOut } from './lib/auth'
import { getSyncedUserId } from './lib/sync'
import AddFoodView from './views/AddFoodView.vue'
import DiaryView from './views/DiaryView.vue'
import LoginView from './views/LoginView.vue'
import SettingsView from './views/SettingsView.vue'
import StatsView from './views/StatsView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Таб-бар показываем только на основных экранах. */
    tabBar?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'diary', component: DiaryView, meta: { tabBar: true } },
    // тот же экран, что и '/' — просто с явной датой (свайп по неделе,
    // календарь). Отдельный path вместо необязательного :date? — так
    // проще типизировать route.params.date как строку без undefined-веток
    { path: '/day/:date', name: 'diary-date', component: DiaryView, meta: { tabBar: true } },
    { path: '/day/:date/add/:meal', name: 'add-food', component: AddFoodView, props: true },
    {
      path: '/day/:date/snack/:snackId/add',
      name: 'add-food-snack',
      component: AddFoodView,
      props: (route) => ({ date: route.params.date, meal: 'snack', snackId: route.params.snackId }),
    },
    { path: '/stats', name: 'stats', component: StatsView, meta: { tabBar: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { tabBar: true } },
    // не требует сессии для показа — сам логин, страница обязана быть публичной
    { path: '/login', name: 'login', component: LoginView },
    // Любой неизвестный адрес — на дневник. Без этого RouterView не рисует
    // ничего и остаётся пустой экран без таб-бара (iOS может запустить
    // PWA не со start_url, а, например, с /index.html)
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Без входа — сразу на экран почты (владелица, 04.10: раньше открывался
// пустой дневник, в который ничего не добавить). После входа LoginView
// возвращает туда, куда шли (`redirect`), по умолчанию — в дневник.
//
// Офлайн-first не ломаем: если на устройстве уже есть дневник (был синк),
// пускаем сразу, не дожидаясь сети — на iOS в авиарежиме запрос висит.
// Сессию проверяем фоном; ответит сервер 401 — `signedOut`, и watch ниже
// уведёт на вход. Устройство без дневника — ждём ответа сервера.
const FIRST_CHECK_TIMEOUT_MS = 6000

function toLogin(fullPath: string) {
  return { name: 'login', query: fullPath === '/' ? {} : { redirect: fullPath } }
}

function checkSessionWithTimeout() {
  return Promise.race([
    checkSession(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_CHECK_TIMEOUT_MS)),
  ])
}

router.beforeEach(async (to) => {
  // Уже вошла и открыла экран входа (например, перезагрузка на нём) — в дневник
  if (to.name === 'login') {
    if (me.value) return '/'
    if (signedOut.value) return true
    return (await checkSessionWithTimeout()) ? '/' : true
  }
  if (signedOut.value) return toLogin(to.fullPath)
  if (me.value) return true
  if ((await getSyncedUserId()) !== null) {
    void checkSession()
    return true
  }
  return (await checkSessionWithTimeout()) ? true : toLogin(to.fullPath)
})

// «Выйти» или сессия протухла посреди работы — на вход; после входа — в
// дневник, а не обратно в Настройки, откуда выходили
watch(signedOut, (out) => {
  if (out && router.currentRoute.value.name !== 'login') void router.replace(toLogin('/'))
})
