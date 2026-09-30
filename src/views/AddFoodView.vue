<script setup lang="ts">
import { ArrowLeft, ChevronDown, ListChecks, ScanLine } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AddEntrySheet from '../components/AddEntrySheet.vue'
import BarcodeScannerSheet from '../components/BarcodeScannerSheet.vue'
import FoodFormSheet from '../components/FoodFormSheet.vue'
import FoodListRow from '../components/FoodListRow.vue'
import MealTargetSheet from '../components/MealTargetSheet.vue'
import { fetchCatalogByBarcode } from '../lib/barcode'
import { useCatalogSearch } from '../lib/catalog'
import { capitalizeFirst, formatDateWithWeekday, todayLocalDate } from '../lib/date'
import { db, type Entry } from '../lib/db'
import { addEntry, targetLabel, type MealTarget } from '../lib/diary'
import { pickFromCatalog, pickFromEntry, pickFromFood, withBrand, type PickItem } from '../lib/pick'
import { matchesQuery } from '../lib/search'
import { useLiveQuery } from '../lib/useLiveQuery'

const props = defineProps<{ date: string; meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'; snackId?: string }>()
const router = useRouter()

const target = ref<MealTarget>(
  props.meal === 'snack'
    ? { type: 'snack', snackId: props.snackId ?? '', name: 'Перекус' }
    : { type: 'meal', meal: props.meal },
)
onMounted(async () => {
  if (props.meal === 'snack' && props.snackId) {
    const snack = await db.snacks.get(props.snackId)
    if (snack) target.value = { type: 'snack', snackId: snack.id, name: snack.name }
  }
})
const pickingTarget = ref(false)
function pickTarget(t: MealTarget) {
  target.value = t
  pickingTarget.value = false
}

const tab = ref<'history' | 'products' | 'dishes' | 'catalog'>('history')
const query = ref('')
const searching = computed(() => query.value.trim().length > 0)

// С удалёнными: удалённая из дневника еда остаётся в Истории — и в общей, и
// в фильтре своего приёма (владелица). Удаление убирает запись из дня, но
// не стирает то, что ты это ела. Граммы с прошлого раза — тоже с них.
const allEntries = useLiveQuery(() => db.entries.toArray(), [])
const allFoods = useLiveQuery(() => db.foods.filter((f) => f.deletedAt === null).toArray(), [])
const foodsById = computed(() => new Map(allFoods.value.map((f) => [f.id, f])))
// «Моя версия» продукта из базы (этап 2.6) показывается вместо оригинала —
// и в Истории, и в блоке «База»
const myVersionByCatalog = computed(
  () => new Map(allFoods.value.filter((f) => f.sourceCatalogId).map((f) => [f.sourceCatalogId!, f])),
)

// История — без дублей: один продукт один раз, последний использованный
// сверху, с последними граммами (обратная связь; README был по дням).
// Теперь в ней и продукты каталога — ключ по foodId либо catalogId.
//
// 1.8: фильтр по приёму пищи (Все · Завтрак · Обед · Ужин · Перекусы —
// все перекусы разом, как бы ни назывались). Он решает только, КАКИЕ
// продукты и в каком порядке; граммы — всё равно из последнего раза в
// любом приёме (владелица), поэтому строка берётся из общей «последней».
// Куда добавляется еда, фильтр не меняет — это `target`.
type HistoryFilter = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'snack'
const HISTORY_FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'breakfast', label: 'Завтрак' },
  { value: 'lunch', label: 'Обед' },
  { value: 'dinner', label: 'Ужин' },
  { value: 'snack', label: 'Перекусы' },
]
const historyFilter = ref<HistoryFilter>('all')

function buildHistory(filter: HistoryFilter) {
  const latest = new Map<string, Entry>()
  const usedAt = new Map<string, string>() // когда последний раз — в выбранном приёме
  for (const e of allEntries.value) {
    const key = e.foodId ? `food:${e.foodId}` : e.catalogId ? `catalog:${e.catalogId}` : null
    if (!key || !matchesQuery(query.value, withBrand(e.name, e.brand))) continue
    const prev = latest.get(key)
    if (!prev || e.createdAt > prev.createdAt) latest.set(key, e)
    if (filter !== 'all' && e.meal !== filter) continue
    const prevUsed = usedAt.get(key)
    if (!prevUsed || e.createdAt > prevUsed) usedAt.set(key, e.createdAt)
  }
  // Запись с оригиналом из базы, а у меня уже есть «моя версия» — в Истории
  // показываем версию (этап 2.6: «мой вариант вместо оригинала»). Тогда два
  // ключа могут схлопнуться в один продукт — оставляем более свежий.
  const seen = new Set<string>()
  return [...usedAt]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([key]) => {
      const e = latest.get(key)!
      const version = !e.foodId && e.catalogId ? myVersionByCatalog.value.get(e.catalogId) : undefined
      return { entry: e, item: version ? pickFromFood(version) : pickFromEntry(e, foodsById.value) }
    })
    .filter((r): r is { entry: Entry; item: PickItem } => r.item !== null && !seen.has(r.item.key) && (seen.add(r.item.key), true))
}
const historyRows = computed(() => buildHistory(historyFilter.value))
// В поиске вкладок (и переключателя) не видно — ищем по всей Истории,
// иначе продукт «пропадал» бы из-за фильтра, которого не видно.
const searchHistoryRows = computed(() => buildHistory('all'))

const productRows = computed(() =>
  allFoods.value
    .filter((f) => f.kind === 'product' && matchesQuery(query.value, withBrand(f.name, f.brand)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map(pickFromFood),
)
const dishRows = computed(() =>
  allFoods.value
    .filter((f) => f.kind === 'dish' && matchesQuery(query.value, f.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map(pickFromFood),
)

// База — только с сервера (см. lib/catalog.ts). Прошлые граммы у продукта
// каталога — из последней записи с ним: своей строки, где их хранить, нет.
const catalog = useCatalogSearch(query)
const lastGramsByCatalog = computed(() => {
  const latest = new Map<string, Entry>()
  for (const e of allEntries.value) {
    if (!e.catalogId) continue
    const prev = latest.get(e.catalogId)
    if (!prev || e.createdAt > prev.createdAt) latest.set(e.catalogId, e)
  }
  return new Map([...latest].map(([id, e]) => [id, e.grams]))
})
const catalogRows = computed(() =>
  catalog.items.value
    .filter((c) => !myVersionByCatalog.value.has(c.id))
    .map((c) => pickFromCatalog(c, lastGramsByCatalog.value.get(c.id) ?? null)),
)

// Поиск: все разделы сразу блоками, каждый продукт — один раз, в самом
// верхнем блоке, где нашёлся (История → Продукты → Блюда → База, README).
const searchBlocks = computed(() => {
  const used = new Set<string>()
  const take = (rows: PickItem[]) => rows.filter((r) => !used.has(r.key) && (used.add(r.key), true))
  const history = searchHistoryRows.value.filter((r) => !used.has(r.item.key) && (used.add(r.item.key), true))
  return {
    history,
    products: take(productRows.value),
    dishes: take(dishRows.value),
    catalog: take(catalogRows.value),
  }
})

// router.push на конкретный день, а не router.back(): экран может быть
// открыт без записи в истории браузера (прямая ссылка, перезагрузка) —
// back() тогда улетает в about:blank, поймала на тесте.
async function quickAdd(item: PickItem) {
  await addEntry(item, props.date, target.value, item.lastGrams ?? 100)
  void router.push(`/day/${props.date}`)
}

const opening = ref<PickItem | null>(null)

const creatingKind = ref<'product' | 'dish' | null>(null)
const presetBarcode = ref<string | undefined>(undefined)
function closeCreating() {
  creatingKind.value = null
  presetBarcode.value = undefined
}
async function onFoodSaved(id: string, addNow: boolean) {
  closeCreating()
  if (!addNow) return
  const food = await db.foods.get(id)
  if (food) opening.value = pickFromFood(food)
}

// Сканер (этап 3, README «Штрихкод»): сначала свои продукты — офлайн,
// потом каталог/живой OFF (lib/barcode.ts), не нашлось нигде — форма
// нового продукта со штрихкодом.
const scanning = ref(false)
async function onBarcodeDetected(code: string) {
  scanning.value = false
  const localFood = allFoods.value.find((f) => f.barcode === code)
  if (localFood) {
    opening.value = pickFromFood(localFood)
    return
  }
  const lookup = await fetchCatalogByBarcode(code)
  if (lookup.status === 'found') {
    const version = myVersionByCatalog.value.get(lookup.item.id)
    opening.value = version ? pickFromFood(version) : pickFromCatalog(lookup.item, lastGramsByCatalog.value.get(lookup.item.id) ?? null)
    return
  }
  presetBarcode.value = code
  creatingKind.value = 'product'
}

function afterAdd() {
  opening.value = null
  void router.push(`/day/${props.date}`)
}

// Множественный выбор (обратная связь): отметить сразу несколько строк —
// с любых вкладок и блоков, в т.ч. из Базы, — у каждой свой вес, добавить
// всё разом. Выбор общий на экран и не сбрасывается сменой вкладки.
const selectMode = ref(false)
const selection = ref(new Map<string, { item: PickItem; grams: number }>())
const selectedCount = computed(() => selection.value.size)

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selection.value = new Map()
}
function toggleSelect(item: PickItem) {
  const next = new Map(selection.value)
  if (next.has(item.key)) next.delete(item.key)
  else next.set(item.key, { item, grams: item.lastGrams ?? 100 })
  selection.value = next
}
function setSelectionGrams(item: PickItem, grams: number) {
  const cur = selection.value.get(item.key)
  if (!cur) return
  const next = new Map(selection.value)
  next.set(item.key, { ...cur, grams })
  selection.value = next
}
async function bulkAdd() {
  for (const { item, grams } of selection.value.values()) {
    if (grams > 0) await addEntry(item, props.date, target.value, grams)
  }
  selection.value = new Map()
  selectMode.value = false
  void router.push(`/day/${props.date}`)
}

function rowBind(item: PickItem) {
  return {
    selectable: selectMode.value,
    selected: selection.value.has(item.key),
    grams: selection.value.get(item.key)?.grams,
  }
}
function rowOn(item: PickItem) {
  return {
    open: () => (opening.value = item),
    add: () => void quickAdd(item),
    toggle: () => toggleSelect(item),
    'update:grams': (g: number) => setSelectionGrams(item, g),
  }
}
// ✎ — своя версия продукта из базы (README «Мои версии продуктов из базы»)
function titleFor(item: PickItem): string {
  return item.food?.sourceCatalogId ? `${item.name} ✎` : item.name
}
</script>

<template>
  <div class="min-h-dvh bg-bg flex flex-col">
    <header class="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <button type="button" @click="router.push(`/day/${date}`)" class="w-9 h-9 flex items-center justify-center text-ink shrink-0">
          <ArrowLeft :size="20" />
        </button>
        <button type="button" @click="pickingTarget = true" class="flex items-center gap-1 text-lg font-semibold text-ink">
          {{ targetLabel(target) }}
          <ChevronDown :size="16" />
        </button>
        <span class="text-sm text-muted">
          {{ date === todayLocalDate() ? 'сегодня' : capitalizeFirst(formatDateWithWeekday(date)) }}
        </span>
        <button type="button" @click="toggleSelectMode" class="ml-auto flex items-center gap-1 text-sm" :class="selectMode ? 'text-accent' : 'text-muted'">
          <ListChecks :size="16" />
          {{ selectMode ? 'Отмена' : 'Выбрать' }}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <input
          v-model="query"
          type="text"
          placeholder="Поиск…"
          class="flex-1 rounded-2xl glass px-4 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
        />
        <button type="button" aria-label="Сканировать штрихкод" @click="scanning = true" class="w-10 h-10 rounded-2xl glass flex items-center justify-center text-ink shrink-0">
          <ScanLine :size="18" />
        </button>
      </div>

      <!-- Вкладки — только пока не ищем; при поиске все разделы показываются сразу блоками -->
      <div v-if="!searching" class="flex gap-1 text-sm">
        <button type="button" @click="tab = 'history'" class="flex-1 py-2 rounded-xl" :class="tab === 'history' ? 'bg-accent text-white' : 'text-muted'">История</button>
        <button type="button" @click="tab = 'products'" class="flex-1 py-2 rounded-xl" :class="tab === 'products' ? 'bg-accent text-white' : 'text-muted'">Продукты</button>
        <button type="button" @click="tab = 'dishes'" class="flex-1 py-2 rounded-xl" :class="tab === 'dishes' ? 'bg-accent text-white' : 'text-muted'">Блюда</button>
        <button type="button" @click="tab = 'catalog'" class="flex-1 py-2 rounded-xl" :class="tab === 'catalog' ? 'bg-accent text-white' : 'text-muted'">База</button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto px-4 pb-6">
      <!-- Поиск: блоки по очереди, каждый продукт один раз -->
      <template v-if="searching">
        <template v-if="searchBlocks.history.length">
          <h3 class="text-xs text-muted mb-1.5 px-1">История</h3>
          <div class="rounded-2xl glass overflow-hidden mb-4">
            <FoodListRow
              v-for="row in searchBlocks.history"
              :key="row.item.key"
              :title="titleFor(row.item)"
              :trailing="`${row.entry.grams} г`"
              v-bind="rowBind(row.item)"
              v-on="rowOn(row.item)"
            />
          </div>
        </template>
        <template v-if="searchBlocks.products.length">
          <h3 class="text-xs text-muted mb-1.5 px-1">Продукты</h3>
          <div class="rounded-2xl glass overflow-hidden mb-4">
            <FoodListRow v-for="item in searchBlocks.products" :key="item.key" :title="titleFor(item)" v-bind="rowBind(item)" v-on="rowOn(item)" />
          </div>
        </template>
        <template v-if="searchBlocks.dishes.length">
          <h3 class="text-xs text-muted mb-1.5 px-1">Блюда</h3>
          <div class="rounded-2xl glass overflow-hidden mb-4">
            <FoodListRow v-for="item in searchBlocks.dishes" :key="item.key" :title="titleFor(item)" v-bind="rowBind(item)" v-on="rowOn(item)" />
          </div>
        </template>
        <!-- База: без сети/входа блок не показываем (README), пока грузится — тихая подпись -->
        <template v-if="searchBlocks.catalog.length">
          <h3 class="text-xs text-muted mb-1.5 px-1">База</h3>
          <div class="rounded-2xl glass overflow-hidden mb-4">
            <FoodListRow v-for="item in searchBlocks.catalog" :key="item.key" :title="titleFor(item)" v-bind="rowBind(item)" v-on="rowOn(item)" />
          </div>
        </template>
        <p v-else-if="catalog.status.value === 'loading'" class="text-xs text-muted px-1 mb-4">База: ищу…</p>
        <p
          v-if="!searchBlocks.history.length && !searchBlocks.products.length && !searchBlocks.dishes.length && !searchBlocks.catalog.length && catalog.status.value !== 'loading'"
          class="text-sm text-muted py-6 text-center"
        >
          Ничего не нашлось
        </p>
      </template>

      <!-- Без поиска: вкладки -->
      <template v-else-if="tab === 'history'">
        <div class="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4">
          <button
            v-for="f in HISTORY_FILTERS"
            :key="f.value"
            type="button"
            @click="historyFilter = f.value"
            class="shrink-0 rounded-full px-3 py-1 text-xs border"
            :class="historyFilter === f.value ? 'bg-ink text-bg border-ink' : 'border-line text-muted'"
          >
            {{ f.label }}
          </button>
        </div>
        <div class="rounded-2xl glass overflow-hidden">
          <p v-if="historyRows.length === 0" class="px-4 py-3 text-sm text-muted">Пока пусто</p>
          <FoodListRow
            v-for="row in historyRows"
            :key="row.item.key"
            :title="titleFor(row.item)"
            :trailing="`${row.entry.grams} г`"
            v-bind="rowBind(row.item)"
            v-on="rowOn(row.item)"
          />
        </div>
      </template>

      <template v-else-if="tab === 'products'">
        <div class="rounded-2xl glass overflow-hidden mb-3">
          <p v-if="productRows.length === 0" class="px-4 py-3 text-sm text-muted">Ничего нет</p>
          <FoodListRow v-for="item in productRows" :key="item.key" :title="titleFor(item)" v-bind="rowBind(item)" v-on="rowOn(item)" />
        </div>
        <button type="button" @click="creatingKind = 'product'" class="text-sm text-accent px-1">+ Новый продукт</button>
      </template>

      <template v-else-if="tab === 'dishes'">
        <div class="rounded-2xl glass overflow-hidden mb-3">
          <p v-if="dishRows.length === 0" class="px-4 py-3 text-sm text-muted">Ничего нет</p>
          <FoodListRow v-for="item in dishRows" :key="item.key" :title="titleFor(item)" v-bind="rowBind(item)" v-on="rowOn(item)" />
        </div>
        <button type="button" @click="creatingKind = 'dish'" class="text-sm text-accent px-1">+ Новое блюдо</button>
      </template>

      <!-- База без запроса: сам каталог — сотни тысяч строк, листать нечего, только искать -->
      <template v-else-if="tab === 'catalog'">
        <p class="text-sm text-muted px-1 py-4">
          Начните вводить название — ищем по базе продуктов: базовые продукты и покупные из Open Food Facts.
        </p>
      </template>
    </div>

    <div
      v-if="selectMode && selectedCount > 0"
      class="sticky bottom-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] border-t border-line bg-bg"
    >
      <button
        type="button"
        aria-label="Добавить выбранное"
        @click="bulkAdd"
        class="w-full rounded-2xl py-3 text-sm font-medium text-white bg-accent"
      >
        Добавить ({{ selectedCount }})
      </button>
    </div>

    <MealTargetSheet v-if="pickingTarget" :date="date" @close="pickingTarget = false" @pick="pickTarget" />
    <AddEntrySheet v-if="opening" :item="opening" :date="date" :target="target" @close="opening = null" @added="afterAdd" />
    <FoodFormSheet v-if="creatingKind" :kind="creatingKind" :preset-barcode="presetBarcode" @close="closeCreating" @saved="onFoodSaved" />
    <BarcodeScannerSheet v-if="scanning" @close="scanning = false" @detected="onBarcodeDetected" />
  </div>
</template>
