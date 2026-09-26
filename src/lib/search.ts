/**
 * Локальный поиск по Истории/Продуктам/Блюдам (README: «Подстрока в любом
 * месте названия и марки; без учёта регистра; ё = е; запятая/точка не
 * важны» — например «Молоко 3.2%» находится по «32», а «Геркулес»
 * по «геркулес.»).
 *
 * Правила — те же, что у серверного поиска по каталогу (db/searchText.ts),
 * держать в синхроне: иначе в одном и том же поиске блок «База» находил бы
 * одно, а свои продукты — другое. Поэтому и здесь «йо» = е («ёгурт» →
 * «йогурт») и поиск по словам: каждое слово запроса должно найтись где-то
 * в названии или марке, в любом порядке («грудка куриная» → «Куриная грудка»).
 */
export function normalizeForSearch(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/йо/g, 'е')
      // Диакритика не важна: «ca phe» → «Cà phê sữa» (см. db/searchText.ts)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/đ/g, 'd')
      .replace(/[.,]/g, '')
  )
}

export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fields.filter(Boolean).map((f) => normalizeForSearch(f!)).join(' | ')
  return words.every((w) => haystack.includes(w))
}
