import { index, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Общий каталог продуктов — отдельный проект Neon (`fuel-catalog`), чтобы
 * каталог не съел лимит free tier (0,5 ГБ) у личных данных (README «БД»).
 * Пользовательских данных здесь нет: только базовые продукты и срез Open
 * Food Facts, одинаковые для всех.
 */
export const catalogProducts = pgTable(
  'catalog_products',
  {
    // Стабильный id, а не случайный: на него ссылаются entries.catalogId и
    // foods.sourceCatalogId в базе `fuel`, а каталог периодически
    // перезаливается. 'off:<штрихкод>' или 'basic:<slug>'.
    id: text('id').primaryKey(),
    barcode: text('barcode').unique(),
    name: text('name').notNull(),
    brand: text('brand'),
    protein: real('protein').notNull(), // на 100 г
    fat: real('fat').notNull(),
    carbs: real('carbs').notNull(),
    kcal: real('kcal').notNull(),
    source: text('source').notNull(), // 'basic' | 'off'
    countries: text('countries').array().notNull().default([]),
    // Все варианты названия (ru/en/локальное) + марка, нормализованные
    // (см. db/searchText.ts) — по нему идёт ILIKE + similarity()
    search: text('search').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('catalog_search_trgm_idx').using('gin', t.search.op('gin_trgm_ops'))],
)
