/**
 * Сканер штрихкода (README «Сканер штрихкода», PLAN.md этап 3). Safari на
 * iOS не умеет `BarcodeDetector` нативно — используем полифилл на
 * zxing-wasm. .wasm держим у себя (не с jsDelivr): он попадает в runtime-
 * кэш service worker'а при первом сканировании (vite.config.ts) и дальше
 * работает офлайн, а в install-время precache не раздувает (~1 МБ, тот же
 * урок, что с иконками манифеста).
 */
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { api } from './api'
import type { CatalogItem } from './pick'

let prepared = false
function ensureZXingReady() {
  if (prepared) return
  prepared = true
  prepareZXingModule({ overrides: { locateFile: () => wasmUrl } })
}

// Только форматы штрихкодов на упаковках еды — матричные (QR и т.п.) не нужны.
const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'] as const

export function createBarcodeDetector(): BarcodeDetector {
  ensureZXingReady()
  return new BarcodeDetector({ formats: [...BARCODE_FORMATS] })
}

export type CatalogBarcodeLookup = { status: 'found'; item: CatalogItem } | { status: 'not-found' } | { status: 'offline' }

/** Каталог, а если там нет — живой запрос к OFF (см. серверный хендлер). */
export async function fetchCatalogByBarcode(code: string): Promise<CatalogBarcodeLookup> {
  try {
    const res = await api.get<{ item: CatalogItem | null }>(`/api/catalog/barcode/${encodeURIComponent(code)}`)
    return res.item ? { status: 'found', item: res.item } : { status: 'not-found' }
  } catch {
    return { status: 'offline' }
  }
}
