// Импорт среза Open Food Facts в каталог fuel-catalog (README «База
// продуктов → Open Food Facts», PLAN.md этап 2.3).
//
// Дамп — один parquet на Hugging Face (openfoodfacts/product-database,
// food.parquet, ~8 ГБ, ~4,8 млн товаров). По сети колонками читать нельзя —
// HF отвечает 429 на тысячи range-запросов, — поэтому сначала скачать файл:
//
//   curl -L --http1.1 -C - -o food.parquet \
//     https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet
//   (обрывы — перезапустить ту же команду, -C - докачает)
//
// Потом:
//   cd scripts/off-import && npm install
//   node import.mjs --parquet /путь/food.parquet --dry   — только посчитать и оценить объём
//   node import.mjs --parquet /путь/food.parquet         — залить
//
// Идемпотентно: id = 'off:<штрихкод>' (стабильный — на него ссылаются
// записи дневника), повторный прогон обновляет строки, товары, пропавшие
// из нового среза, удаляются из каталога. Базовые продукты не трогает.
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { DuckDBInstance } from '@duckdb/node-api'
import { neon } from '@neondatabase/serverless'
import { and, eq, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { catalogProducts } from '../../db/catalogSchema.ts'
import { buildSearchText } from '../../db/searchText.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '..', '.env') })

const args = process.argv.slice(2)
const parquet = args[args.indexOf('--parquet') + 1]
const dry = args.includes('--dry')
const force = args.includes('--force')
if (!args.includes('--parquet') || !parquet) {
  console.error('Нужен --parquet /путь/food.parquet (как скачать — в шапке файла)')
  process.exit(1)
}

// Страны — «где продаётся» (countries_tags), так импорт с полок тоже попадает (README)
const COUNTRIES = [
  'russia', 'vietnam', 'thailand', 'japan', 'south-korea', 'china', 'taiwan',
  'hong-kong', 'indonesia', 'malaysia', 'singapore', 'philippines', 'cambodia', 'laos',
].map((c) => `en:${c}`)
// Приоритет языка названия: русское → английское → основное (местное) →
// любое. Английское раньше местного — решение владельца (отступление от
// README): вьетнамское/тайское название не прочитать, английское понятно.
// Искать можно по любому — в search лежат все варианты.
const NAME_LANGS = ['ru', 'en', 'main']
// Free tier Neon — 0,5 ГБ на проект; оставляем запас под базовые продукты и рост
const SIZE_LIMIT_MB = 350

const duck = await (await DuckDBInstance.create(':memory:')).connect()
const nut = (name) => `list_filter(nutriments, x -> x.name = '${name}')[1]."100g"`
const t0 = Date.now()
const reader = await duck.runAndReadAll(`
  WITH base AS (
    SELECT code, brands, countries_tags, product_name,
      ${nut('proteins')} AS protein,
      ${nut('fat')} AS fat,
      ${nut('carbohydrates')} AS carbs,
      ${nut('energy-kcal')} AS kcal
    FROM read_parquet('${parquet.replace(/'/g, "''")}')
    WHERE list_has_any(countries_tags, [${COUNTRIES.map((c) => `'${c}'`).join(',')}])
      AND code IS NOT NULL AND length(code) >= 6
      AND NOT coalesce(obsolete, false)
  )
  SELECT * FROM base
  WHERE protein IS NOT NULL AND fat IS NOT NULL AND carbs IS NOT NULL
  -- Один штрихкод бывает у нескольких записей OFF — берём ту, где больше
  -- вариантов названия (обычно самая заполненная), детерминированно
  QUALIFY row_number() OVER (PARTITION BY code ORDER BY len(product_name) DESC, brands NULLS LAST, protein) = 1
`)
const raw = reader.getRowObjectsJS()
console.log(`Товаров в наших странах с заполненными Б/Ж/У: ${raw.length} (${Math.round((Date.now() - t0) / 1000)} с)`)

const products = []
const skipped = { noName: 0, badMacros: 0 }
for (const r of raw) {
  const names = (r.product_name ?? []).filter((n) => n?.text?.trim())
  const pick = NAME_LANGS.map((l) => names.find((n) => n.lang === l)).find(Boolean) ?? names[0]
  if (!pick) { skipped.noName++; continue }
  const protein = Number(r.protein), fat = Number(r.fat), carbs = Number(r.carbs)
  // Мусор в OFF встречается (граммы на порцию вместо 100 г, опечатки) —
  // отсекаем явно невозможное, как предупреждение «Б+Ж+У > 100» в форме
  const bad = [protein, fat, carbs].some((v) => !Number.isFinite(v) || v < 0 || v > 100) || protein + fat + carbs > 105
  let kcal = r.kcal == null ? NaN : Number(r.kcal)
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 950) kcal = protein * 4 + fat * 9 + carbs * 4 // README: нет ккал — из БЖУ
  if (bad) { skipped.badMacros++; continue }
  const brand = r.brands?.split(',')[0]?.trim() || null
  products.push({
    id: `off:${r.code}`,
    barcode: r.code,
    name: pick.text.trim().slice(0, 200),
    brand: brand?.slice(0, 100) ?? null,
    protein: +protein.toFixed(2),
    fat: +fat.toFixed(2),
    carbs: +carbs.toFixed(2),
    kcal: Math.round(kcal),
    source: 'off',
    countries: (r.countries_tags ?? []).filter((c) => COUNTRIES.includes(c)).map((c) => c.slice(3)),
    // Все варианты названия (ru/en/локальное) + марка — одной строкой (README)
    search: buildSearchText(...names.map((n) => n.text), brand).slice(0, 1000),
  })
}

// Оценка объёма в Postgres до заливки (README: «проверить реальный размер
// до заливки»): данные строки + заголовок кортежа и индексы. GIN-триграммы
// по search — самый тяжёлый, примерно 2× от самого текста.
const textBytes = products.reduce((s, p) => s + Buffer.byteLength(p.id + p.barcode + p.name + (p.brand ?? '') + p.search + p.countries.join(','), 'utf8'), 0)
const searchBytes = products.reduce((s, p) => s + Buffer.byteLength(p.search, 'utf8'), 0)
const estimateMb = (textBytes + products.length * (24 + 4 * 4 + 40) + searchBytes * 2 + products.length * 60) / 1024 / 1024
const byCountry = {}
for (const p of products) for (const c of p.countries) byCountry[c] = (byCountry[c] ?? 0) + 1
console.log(`После чистки: ${products.length} (без названия: ${skipped.noName}, невозможные БЖУ: ${skipped.badMacros})`)
console.log('По странам:', Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', '))
console.log(`Оценка объёма в Postgres: ~${Math.round(estimateMb)} МБ (порог ${SIZE_LIMIT_MB} МБ из 500 free tier)`)
console.log('Примеры:', products.slice(0, 5).map((p) => `${p.name}${p.brand ? ' · ' + p.brand : ''} Б${p.protein}/Ж${p.fat}/У${p.carbs}/${p.kcal}`).join(' | '))

if (dry) process.exit(0)
if (estimateMb > SIZE_LIMIT_MB && !force) {
  console.error(`\nОценка больше порога — заливка отменена. Сузить страны или запустить с --force.`)
  process.exit(1)
}

const db = drizzle(neon(process.env.CATALOG_DATABASE_URL))
const loadStart = new Date()
const BATCH = 1000 // 12 полей × 1000 — далеко от лимита параметров Postgres
for (let i = 0; i < products.length; i += BATCH) {
  for (let attempt = 1; ; attempt++) {
    try {
      await db
        .insert(catalogProducts)
        .values(products.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: catalogProducts.id,
          set: {
            barcode: sql`excluded.barcode`,
            name: sql`excluded.name`,
            brand: sql`excluded.brand`,
            protein: sql`excluded.protein`,
            fat: sql`excluded.fat`,
            carbs: sql`excluded.carbs`,
            kcal: sql`excluded.kcal`,
            countries: sql`excluded.countries`,
            search: sql`excluded.search`,
            updatedAt: sql`now()`,
          },
        })
      break
    } catch (err) {
      if (attempt >= 5) throw err
      await new Promise((r) => setTimeout(r, 2000 * attempt)) // сеть рвётся — повторяем пачку
    }
  }
  process.stdout.write(`\rЗалито ${Math.min(i + BATCH, products.length)} / ${products.length}`)
}
// Пропавшие из нового среза — удаляем (обновлённые получили updatedAt = now())
const removed = await db
  .delete(catalogProducts)
  .where(and(eq(catalogProducts.source, 'off'), lt(catalogProducts.updatedAt, loadStart)))
  .returning({ id: catalogProducts.id })
const cat = neon(process.env.CATALOG_DATABASE_URL)
const [size] = await cat`select pg_size_pretty(pg_total_relation_size('catalog_products')) as table_size, pg_size_pretty(pg_database_size(current_database())) as db_size, (select count(*) from catalog_products where source = 'off')::int as off_rows`
console.log(`\nГотово. OFF в каталоге: ${size.off_rows}, удалено пропавших: ${removed.length}. Размер таблицы с индексами: ${size.table_size}, всей базы: ${size.db_size}`)
