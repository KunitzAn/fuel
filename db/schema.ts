import { index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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

/**
 * Общие для всех синкаемых таблиц колонки времени:
 * - `updatedAt` — ставит клиент, по нему решается last-write-wins при push
 *   (конфликт правок одной строки на двух устройствах)
 * - `serverUpdatedAt` — ставит **сервер** при каждой записи (`now()` в
 *   upsert, не значение от клиента). Pull идёт по ней (`?since=`), а не по
 *   `updatedAt` — иначе офлайн-правка, отправленная позже, чем другое
 *   устройство успело синхронизироваться, не долетит до него: курсор
 *   «после X» сравнивался бы с временем на телефоне, а не с моментом,
 *   когда сервер её реально увидел. См. PLAN.md, этап 1.1
 * - `deletedAt` — мягкое удаление, нужно синку, чтобы отличить «удалено на
 *   другом устройстве» от «ещё не доехало сюда»
 */
const syncColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  serverUpdatedAt: timestamp('server_updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

/** Мои продукты и блюда — см. README «Функционал» → «Форма продукта/блюда». */
export const foods = pgTable(
  'foods',
  {
    id: text('id').primaryKey(), // uuid, генерирует клиент — тот же id, что и в Dexie
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'product' | 'dish'
    name: text('name').notNull(),
    brand: text('brand'),
    barcode: text('barcode'),
    protein: real('protein').notNull(), // на 100 г
    fat: real('fat').notNull(),
    carbs: real('carbs').notNull(),
    kcal: real('kcal').notNull(),
    note: text('note'), // рецепт-заметка блюда, в расчётах не участвует
    /** Если это «моя версия» продукта из fuel-catalog — id там, без FK (другой проект Neon). */
    sourceCatalogId: text('source_catalog_id'),
    /** Граммы с прошлого раза — подстановка в окно ввода. */
    lastGrams: real('last_grams'),
    ...syncColumns,
  },
  (t) => [index('foods_user_sync_idx').on(t.userId, t.serverUpdatedAt)],
)

/** Перекусы конкретного дня — «+ перекус после завтрака/обеда/ужина». */
export const snacks = pgTable(
  'snacks',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD, локальная дата клиента
    after: text('after').notNull(), // 'breakfast' | 'lunch' | 'dinner'
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    ...syncColumns,
  },
  (t) => [index('snacks_user_sync_idx').on(t.userId, t.serverUpdatedAt)],
)

/** Записи дневника — снимок КБЖУ на момент добавления, правка продукта их не меняет. */
export const entries = pgTable(
  'entries',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    meal: text('meal').notNull(), // 'breakfast' | 'lunch' | 'dinner' | 'snack'
    snackId: text('snack_id').references(() => snacks.id),
    foodId: text('food_id').references(() => foods.id), // из своих продуктов/блюд
    catalogId: text('catalog_id'), // из fuel-catalog, без FK (другой проект Neon)
    name: text('name').notNull(), // снимок
    brand: text('brand'),
    protein: real('protein').notNull(), // снимок на 100 г
    fat: real('fat').notNull(),
    carbs: real('carbs').notNull(),
    kcal: real('kcal').notNull(),
    grams: real('grams').notNull(),
    ...syncColumns,
  },
  (t) => [index('entries_user_sync_idx').on(t.userId, t.serverUpdatedAt)],
)
