import { and, desc, ilike, sql, type SQL } from 'drizzle-orm'
import { catalogProducts } from '../../../db/catalogSchema'
import { normalizeForSearch } from '../../../db/searchText'
import type { AuthedData } from '../../_lib/context'
import { getCatalogDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'

const LIMIT = 30

/** %, _ и \ в ILIKE — служебные; из пользовательского ввода экранируем. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

// GET /api/catalog/search?q= — поиск по общему каталогу (базовые + Open Food
// Facts). Нормализация та же, что при заливке (db/searchText.ts). Запрос
// бьём на слова и требуем каждое — так «грудка куриная» находит «Куриная
// грудка»: названия в OFF пишут в любом порядке слов, а точная подстрока
// (как в README) такое пропускала бы. Базовые выше OFF, внутри — по
// похожести (pg_trgm similarity).
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  const q = normalizeForSearch(new URL(ctx.request.url).searchParams.get('q') ?? '').trim()
  const words = q.split(/\s+/).filter(Boolean)
  // Одна буква — это пол-каталога мусора и полный перебор мимо индекса
  // (триграммному индексу нужно от 3 символов, от 2 ещё терпимо).
  if (q.length < 2) return json({ items: [] })

  const db = getCatalogDb(ctx.env)
  const conditions: SQL[] = words.map((w) => ilike(catalogProducts.search, `%${escapeLike(w)}%`))
  const items = await db
    .select({
      id: catalogProducts.id,
      name: catalogProducts.name,
      brand: catalogProducts.brand,
      protein: catalogProducts.protein,
      fat: catalogProducts.fat,
      carbs: catalogProducts.carbs,
      kcal: catalogProducts.kcal,
      source: catalogProducts.source,
    })
    .from(catalogProducts)
    .where(and(...conditions))
    .orderBy(desc(sql`${catalogProducts.source} = 'basic'`), desc(sql`similarity(${catalogProducts.search}, ${q})`))
    .limit(LIMIT)

  return json({ items })
}
