import { index, integer, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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

/**
 * Ручная активность и (этап 5) тренировки с Apple Watch через Команду iOS —
 * обе влияют на «потрачено» и на цель дня (README «Цели и энергия»).
 * `externalId`/`startedAt`/`durationMin` — только у `source: 'watch'`.
 * `kcal` — активные калории тренировки, как и раньше, участвуют в цели.
 * `totalKcal` — этап 5, не из README до реализации: мысль владелицы,
 * дополнительно тянуть ещё и полные калории тренировки (активные + расход
 * покоя за то же время), только для просмотра, в расчёт цели не входит.
 * Уникальность по `(userId, externalId)` — апсерт одной и той же
 * тренировки при повторной отправке (например, не долетел ответ) не
 * создаёт дубль; у ручных активностей `externalId` всегда `null`, и
 * несколько `null` друг с другом в Postgres не конфликтуют.
 */
export const activities = pgTable(
  'activities',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    source: text('source').notNull(), // 'watch' | 'manual'
    name: text('name'),
    kcal: real('kcal').notNull(),
    totalKcal: real('total_kcal'),
    externalId: text('external_id'), // id тренировки из Здоровья (этап 5)
    startedAt: timestamp('started_at', { withTimezone: true }),
    durationMin: real('duration_min'),
    ...syncColumns,
  },
  (t) => [
    index('activities_user_sync_idx').on(t.userId, t.serverUpdatedAt),
    uniqueIndex('activities_user_external_uidx').on(t.userId, t.externalId),
  ],
)

/**
 * Вся активная энергия за день целиком (этап 5, не из README до
 * реализации) — не только внутри тренировок, мысль владелицы: «пока
 * просто её где-то выведем для себя... мб в будущем пригодится». Только
 * для просмотра, в цель/потрачено не участвует. Без синтетического id —
 * как `day_types`, ключ строки сама дата, правится на месте (Команда
 * присылает свежее число за день, не версия). Пишет только сервер
 * (`/api/health/workouts`, Bearer-токен) — с клиента это read-only.
 */
export const dailyActiveEnergy = pgTable(
  'daily_active_energy',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    // Команда шлёт активную энергию и энергию покоя отдельными запросами,
    // поэтому до прихода второго запроса одно из полей может быть пустым.
    totalActiveKcal: real('total_active_kcal'),
    restingKcal: real('resting_kcal'),
    ...syncColumns,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
    index('daily_active_energy_user_sync_idx').on(t.userId, t.serverUpdatedAt),
  ],
)

/**
 * Личный токен Команды iOS (этап 5) — хранится только хэш, как коды входа
 * (`loginCodes`, `hashCode`). «Выпустить новый» удаляет старый — сырой
 * токен виден один раз, в момент выпуска, дальше только «выпущен тогда-то».
 * Один активный токен на пользователя, отдельной таблицы «истории» не надо.
 */
export const apiTokens = pgTable('api_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

/**
 * Версии настроек целей — правка действует с сегодняшнего дня, прошлые дни
 * остаются со своими цифрами (README «История настроек целей»). Для дня
 * берём версию с максимальным `validFrom ≤ дата` (при нескольких правках в
 * один день — дальше по `createdAt`, см. src/lib/goals.ts).
 */
export const goalSettings = pgTable(
  'goal_settings',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    validFrom: text('valid_from').notNull(), // YYYY-MM-DD
    // Все числовые поля ниже — необязательные (владелица: «это все
    // необязательные настройки»). База (Б/Ж/У/покой) пустая или неполная —
    // цель на день просто не показывается, только факт (README «Цели и
    // энергия»). «На 100 ккал» пустое — 0 (уже и так «нет бонуса», особый
    // null не нужен). High/low пустые (хоть один макрос) — этот тип дня
    // недоступен на выбор, кнопка в дневнике неактивна (src/lib/goals.ts).
    baseProtein: real('base_protein'),
    baseFat: real('base_fat'),
    baseCarbs: real('base_carbs'),
    restingKcal: real('resting_kcal'),
    perHundredProtein: real('per_hundred_protein'),
    perHundredFat: real('per_hundred_fat'),
    perHundredCarbs: real('per_hundred_carbs'),
    // Поправка для типа дня (этап 4.4, не из README — новая мысль
    // владелицы) — та же версия, что и база: правка действует с
    // сегодняшнего дня. High — прибавка, low хранится как положительная
    // величина «убавки» (см. src/lib/goals.ts → manualDayTypeDelta).
    highDeltaProtein: real('high_delta_protein'),
    highDeltaFat: real('high_delta_fat'),
    highDeltaCarbs: real('high_delta_carbs'),
    lowDeltaProtein: real('low_delta_protein'),
    lowDeltaFat: real('low_delta_fat'),
    lowDeltaCarbs: real('low_delta_carbs'),
    // Мин/макс границы нутриентов (этап 4.5, не из README — новая мысль
    // владелицы). Отдельная от базовой цели фича: свои значения, не
    // выводятся из базы. Одна пара границ на все дни (не различаются по
    // типу дня, в отличие от highDelta/lowDelta выше) — так решила
    // владелица. Каждая граница независима от остальных семи: можно
    // задать нижнюю по белку и не задавать по остальным (src/lib/goals.ts).
    minKcal: real('min_kcal'),
    maxKcal: real('max_kcal'),
    minProtein: real('min_protein'),
    maxProtein: real('max_protein'),
    minFat: real('min_fat'),
    maxFat: real('max_fat'),
    minCarbs: real('min_carbs'),
    maxCarbs: real('max_carbs'),
    ...syncColumns,
  },
  (t) => [index('goal_settings_user_sync_idx').on(t.userId, t.serverUpdatedAt)],
)

/**
 * Тип дня — план с утра и факт в конце дня, независимо друг от друга
 * (этап 4.4). В отличие от других таблиц — без синтетического `id`:
 * настоящий ключ строки — дата (один тип на календарный день, правится на
 * месте, а не версионируется), поэтому первичный ключ составной
 * (`userId`, `date`) и одинаков на любом устройстве без координации.
 *
 * `plannedDelta*` — снимок поправки на момент простановки плана (что
 * вручную в настройках, что среднее по статистике) — не пересчитывается
 * потом сам: иначе ориентир на день дрейфовал бы, если статистика
 * изменится за день, пока он идёт.
 */
export const dayTypes = pgTable(
  'day_types',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    planned: text('planned'), // 'low' | 'high' | null
    plannedSource: text('planned_source'), // 'manual' | 'stats' | null
    plannedDeltaProtein: real('planned_delta_protein'),
    plannedDeltaFat: real('planned_delta_fat'),
    plannedDeltaCarbs: real('planned_delta_carbs'),
    actual: text('actual'), // 'low' | 'high' | null — по факту, в конце дня
    ...syncColumns,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
    index('day_types_user_sync_idx').on(t.userId, t.serverUpdatedAt),
  ],
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
