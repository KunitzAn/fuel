/**
 * Поиск по общему каталогу (вкладка «База» и блок «База» в поиске).
 * README: debounce ~250 мс и отмена предыдущего запроса; без сети блок не
 * показывается. Каталог только на сервере — офлайн его нет, в отличие от
 * своих продуктов.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { api, ApiError } from './api'
import type { CatalogItem } from './pick'

const DEBOUNCE_MS = 250
const MIN_QUERY = 2 // как на сервере: короче — пусто

export type CatalogStatus = 'idle' | 'loading' | 'ok' | 'offline' | 'needs-login'

export function useCatalogSearch(query: Ref<string>) {
  const items = ref<CatalogItem[]>([])
  const status = ref<CatalogStatus>('idle')
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  async function run(q: string) {
    controller?.abort()
    const mine = new AbortController()
    controller = mine
    status.value = 'loading'
    try {
      const res = await api.get<{ items: CatalogItem[] }>(
        `/api/catalog/search?q=${encodeURIComponent(q)}`,
        mine.signal,
      )
      if (controller !== mine) return // уже пришёл запрос новее
      items.value = res.items
      status.value = 'ok'
    } catch (err) {
      if (controller !== mine) return
      items.value = []
      status.value = err instanceof ApiError && err.status === 401 ? 'needs-login' : 'offline'
    }
  }

  watch(query, (raw) => {
    clearTimeout(timer)
    const q = raw.trim()
    if (q.length < MIN_QUERY) {
      controller?.abort()
      controller = undefined
      items.value = []
      status.value = 'idle'
      return
    }
    timer = setTimeout(() => void run(q), DEBOUNCE_MS)
  })

  onScopeDispose(() => {
    clearTimeout(timer)
    controller?.abort()
  })

  return { items, status }
}
