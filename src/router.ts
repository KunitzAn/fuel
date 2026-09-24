import { createRouter, createWebHistory } from 'vue-router'
import DiaryView from './views/DiaryView.vue'
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
    { path: '/stats', name: 'stats', component: StatsView, meta: { tabBar: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { tabBar: true } },
  ],
})
