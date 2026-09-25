/**
 * Локальный поиск по Истории/Продуктам/Блюдам (README: «Подстрока в любом
 * месте названия и марки; без учёта регистра; ё = е; запятая/точка не
 * важны» — например «Молоко 3.2%» находится по «32», а «Геркулес»
 * по «геркулес.»).
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,]/g, '')
}

export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeForSearch(query)
  if (!q) return true
  return fields.some((f) => f && normalizeForSearch(f).includes(q))
}
