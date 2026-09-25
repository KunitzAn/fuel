import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    // `npm run dev:api` поднимает Functions отдельно (wrangler pages dev,
    // порт 8788) — без этого прокси фронтенд не видит /api/*.
    proxy: {
      '/api': 'http://localhost:8788',
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // Иконки манифеста (~1 МБ фото-PNG) системе нужны только при
      // «На экран Домой» — это и так онлайн. В офлайн-копии они раздували
      // её с ~350 КБ до ~1,25 МБ, а SW начинает отдавать страницы из кэша
      // только скачав всё целиком: на телефоне установка не успевала до
      // того, как приложение закрывали, и офлайн-запуск шёл в сеть.
      includeManifestIcons: false,
      manifest: {
        name: 'Fuel',
        short_name: 'Fuel',
        description: 'Дневник калорий и КБЖУ',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f5f4',
        theme_color: '#f5f5f4',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // /api/* — живые данные, отдавать на них index.html из кэша нельзя
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,woff2}'],
        // iOS сам выбирает нужный сплэш по media query и кладёт его в свой
        // системный кэш при «Добавить на экран Домой» — нашему SW эти 22
        // файла не нужны, precache тащил бы их в офлайн-шелл зря.
        globIgnores: ['splash/**', 'icons/**'],
      },
    }),
  ],
})
