import { eq } from 'drizzle-orm'
import { catalogProducts } from '../../../../db/catalogSchema'
import { buildSearchText, decodeEntities } from '../../../../db/searchText'
import type { AuthedData } from '../../../_lib/context'
import { getCatalogDb } from '../../../_lib/db'
import type { Env } from '../../../_lib/env'
import { json } from '../../../_lib/http'

// Свой User-Agent — обязателен для API OFF (README «Штрихкод»).
const OFF_USER_AGENT = 'Fuel (personal calorie tracker) - https://fuel.kunitcan.online'
const OFF_FIELDS = 'code,status,product_name,product_name_ru,product_name_en,generic_name,brands,nutriments'

const SELECT_COLUMNS = {
  id: catalogProducts.id,
  barcode: catalogProducts.barcode,
  name: catalogProducts.name,
  brand: catalogProducts.brand,
  protein: catalogProducts.protein,
  fat: catalogProducts.fat,
  carbs: catalogProducts.carbs,
  kcal: catalogProducts.kcal,
  source: catalogProducts.source,
}

// GET /api/catalog/barcode/:code — сначала свой каталог (fuel-catalog),
// если нет — живой запрос к API OFF; найденное сохраняем в каталог, чтобы
// повторный скан того же товара (свой или чужой) не бил по живому API
// снова. Ничего не нашлось нигде — {item: null}, дальше клиент открывает
// форму нового продукта со штрихкодом (README «Штрихкод»).
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (ctx) => {
  const code = ctx.params.code as string
  const db = getCatalogDb(ctx.env)

  const existing = await db.select(SELECT_COLUMNS).from(catalogProducts).where(eq(catalogProducts.barcode, code)).limit(1)
  if (existing[0]) return json({ item: existing[0] })

  let off: { status?: number; product?: Record<string, unknown> }
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': OFF_USER_AGENT },
    })
    if (!res.ok) return json({ item: null })
    off = await res.json()
  } catch {
    return json({ item: null }) // сеть/OFF недоступны — не нашлось, форма нового продукта
  }
  if (off.status !== 1 || !off.product) return json({ item: null })

  const p = off.product
  const nutriments = (p.nutriments ?? {}) as Record<string, unknown>
  const protein = Number(nutriments['proteins_100g'])
  const fat = Number(nutriments['fat_100g'])
  const carbs = Number(nutriments['carbohydrates_100g'])
  // Тот же фильтр мусора, что при разовом импорте (scripts/off-import/import.mjs):
  // без Б/Ж/У или заведомо невозможные значения — не сохраняем, пусть впишет сама.
  const badMacros = [protein, fat, carbs].some((v) => !Number.isFinite(v) || v < 0 || v > 100) || protein + fat + carbs > 105
  const rawName = (p.product_name_ru || p.product_name || p.product_name_en || p.generic_name) as string | undefined
  if (badMacros || !rawName?.trim()) return json({ item: null })

  let kcal = Number(nutriments['energy-kcal_100g'])
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 950) kcal = protein * 4 + fat * 9 + carbs * 4

  const name = decodeEntities(rawName.trim()).slice(0, 200)
  const brandsRaw = p.brands as string | undefined
  const brand = brandsRaw ? decodeEntities(brandsRaw).split(',')[0]?.trim().slice(0, 100) || null : null

  const row = {
    id: `off:${code}`,
    barcode: code,
    name,
    brand,
    protein: +protein.toFixed(2),
    fat: +fat.toFixed(2),
    carbs: +carbs.toFixed(2),
    kcal: Math.round(kcal),
    source: 'off' as const,
    search: buildSearchText(name, brand).slice(0, 1000),
  }
  await db
    .insert(catalogProducts)
    .values(row)
    .onConflictDoUpdate({
      target: catalogProducts.id,
      set: { barcode: row.barcode, name: row.name, brand: row.brand, protein: row.protein, fat: row.fat, carbs: row.carbs, kcal: row.kcal, search: row.search },
    })

  return json({ item: { id: row.id, barcode: row.barcode, name: row.name, brand: row.brand, protein: row.protein, fat: row.fat, carbs: row.carbs, kcal: row.kcal, source: row.source } })
}
