/**
 * Нормализация для поиска по каталогу: и для колонки `search` при заливке,
 * и для запроса в `/api/catalog/search`. Правила — те же, что у
 * локального поиска на клиенте (`src/lib/search.ts`, README «Поиск»):
 * регистр не важен, ё = е, запятые/точки не важны. Держать в синхроне.
 */
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[.,]/g, '')
}

/** Всё, по чему ищем продукт, одной строкой: все варианты названия + марка. */
export function buildSearchText(...parts: (string | null | undefined)[]): string {
  const seen = new Set<string>()
  for (const p of parts) {
    const n = p ? normalizeForSearch(p).trim() : ''
    if (n) seen.add(n)
  }
  return [...seen].join(' | ')
}
