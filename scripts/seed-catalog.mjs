// Заливка базовых продуктов (db/seed/basic-products.csv) в каталог
// fuel-catalog с source='basic'. Идемпотентно: повторный запуск после правки
// таблицы обновляет строки, а убранные из таблицы — удаляет из каталога.
// id в каталоге — 'basic:<id из таблицы>', поэтому переименование продукта
// в таблице не рвёт ссылки из дневника (entries.catalogId).
//
//   node scripts/seed-catalog.mjs --dry   — только проверить таблицу
//   node scripts/seed-catalog.mjs         — проверить и залить
import 'dotenv/config'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { neon } from '@neondatabase/serverless'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { catalogProducts } from '../db/catalogSchema.ts'
import { buildSearchText } from '../db/searchText.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const csvPath = path.join(__dirname, '..', 'db', 'seed', 'basic-products.csv')
const dry = process.argv.includes('--dry')

/** Минимальный CSV: запятые, поля в кавычках (в названиях бывает «3,2%»). */
function parseCsv(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') quoted = false
        else cur += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells)
  }
  const [header, ...body] = rows
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]?.trim() ?? ''])))
}

const raw = parseCsv(await readFile(csvPath, 'utf8'))
const errors = []
const warnings = []
const seen = new Set()
const products = []

for (const [i, r] of raw.entries()) {
  const where = `строка ${i + 2} (${r.id || '?'})`
  const n = Object.fromEntries(['protein', 'fat', 'carbs', 'kcal'].map((k) => [k, Number(r[k])]))
  if (!/^[a-z0-9-]+$/.test(r.id)) errors.push(`${where}: id только латиница/цифры/дефис`)
  if (seen.has(r.id)) errors.push(`${where}: id повторяется`)
  seen.add(r.id)
  if (!r.name) errors.push(`${where}: пустое название`)
  for (const [k, v] of Object.entries(n)) if (!Number.isFinite(v) || v < 0) errors.push(`${where}: ${k} не число`)
  if (n.protein + n.fat + n.carbs > 100) errors.push(`${where}: Б+Ж+У > 100`)
  // Ккал из таблиц могут расходиться с Б×4+Ж×9+У×4 — алкоголь, кислоты,
  // клетчатка. Не ошибка, но заметное расхождение стоит глазами проверить.
  const fromMacros = n.protein * 4 + n.fat * 9 + n.carbs * 4
  if (fromMacros > 0 && Math.abs(n.kcal - fromMacros) / fromMacros > 0.2) {
    warnings.push(`${where} «${r.name}»: ккал ${n.kcal}, по БЖУ выходит ${Math.round(fromMacros)}`)
  }
  products.push({
    id: `basic:${r.id}`,
    barcode: null,
    name: r.name,
    brand: null,
    ...n,
    source: 'basic',
    countries: [],
    search: buildSearchText(r.name),
  })
}

console.log(`Продуктов в таблице: ${products.length}`)
if (warnings.length) console.log(`\nРасхождение ккал с БЖУ > 20% (проверить глазами):\n  ${warnings.join('\n  ')}`)
if (errors.length) {
  console.error(`\nОшибки — заливка отменена:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
if (dry) process.exit(0)

const db = drizzle(neon(process.env.CATALOG_DATABASE_URL))
for (let i = 0; i < products.length; i += 100) {
  await db
    .insert(catalogProducts)
    .values(products.slice(i, i + 100))
    .onConflictDoUpdate({
      target: catalogProducts.id,
      set: {
        name: sql`excluded.name`,
        protein: sql`excluded.protein`,
        fat: sql`excluded.fat`,
        carbs: sql`excluded.carbs`,
        kcal: sql`excluded.kcal`,
        search: sql`excluded.search`,
        updatedAt: sql`now()`,
      },
    })
}
const removed = await db
  .delete(catalogProducts)
  .where(and(eq(catalogProducts.source, 'basic'), notInArray(catalogProducts.id, products.map((p) => p.id))))
  .returning({ id: catalogProducts.id })
const [{ count }] = await db.select({ count: sql`count(*)::int` }).from(catalogProducts).where(eq(catalogProducts.source, 'basic'))
console.log(`\nЗалито. Базовых в каталоге: ${count}${removed.length ? `, удалено убранных из таблицы: ${removed.length}` : ''}`)
