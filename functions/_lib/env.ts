/** Переменные окружения Pages Functions (secrets + vars). */
export interface Env {
  DATABASE_URL: string
  /** Отдельный проект Neon — каталог продуктов (этап 2), не пользовательские данные. */
  CATALOG_DATABASE_URL: string
  /** Секрет подписи session-куки. */
  SESSION_SECRET: string
  RESEND_API_KEY: string
  /** "Name <email>" — отправитель писем с кодом входа. */
  LOGIN_EMAIL_FROM: string
  /** Базовый URL фронтенда — для проверки Origin и (в перспективе) писем. */
  APP_URL: string
}
