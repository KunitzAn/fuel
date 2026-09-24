import { integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Модель дневника (foods, snacks, entries, activities, goal_settings,
// api_tokens) добавится в схему вместе с соответствующими этапами —
// см. PLAN.md и README «Модель данных».

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Коды входа (6 цифр, приходят в письме, вводятся в приложении).
 * Хранится хеш, не сам код — как с паролем. Не ссылка: Resend заворачивает
 * ссылки в click-tracking редирект, который рвётся сам по себе
 * (см. README daylens, раздел «Авторизация» — то же решение здесь).
 */
export const loginCodes = pgTable(
  'login_codes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Неверных попыток ввода — код 6 цифр, короткий TTL один перебор не спасёт. */
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('login_codes_hash_uidx').on(t.codeHash)],
)

/** Только для rate-limit проверки в API — не читается фронтендом. */
export const loginCodeRequests = pgTable('login_code_requests', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  ip: text('ip').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
