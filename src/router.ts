import { createRouter, createWebHistory } from 'vue-router'
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
    { path: '/stats', name: 'stats', component: StatsView, meta: { tabBar: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { tabBar: true } },
    // не требует сессии для показа — сам логин, страница обязана быть публичной
    { path: '/login', name: 'login', component: LoginView },
  ],
})
