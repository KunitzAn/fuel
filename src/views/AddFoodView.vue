<script setup lang="ts">
import { ArrowLeft, ChevronDown, ScanLine } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AddEntrySheet from '../components/AddEntrySheet.vue'
import FoodListRow from '../components/FoodListRow.vue'
import FoodFormSheet from '../components/FoodFormSheet.vue'
import MealTargetSheet from '../components/MealTargetSheet.vue'
import { capitalizeFirst, formatDateWithWeekday, todayLocalDate } from '../lib/date'
import { addEntryFromFood, byCreatedAt, targetLabel, type MealTarget } from '../lib/diary'
import { db, type Entry, type Food } from '../lib/db'
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

const tab = ref<'history' | 'products' | 'dishes'>('history')
const query = ref('')
const searching = computed(() => query.value.trim().length > 0)

const allEntries = useLiveQuery(() => db.entries.filter((e) => e.deletedAt === null).toArray(), [])
const allFoods = useLiveQuery(() => db.foods.filter((f) => f.deletedAt === null).toArray(), [])
const foodsById = computed(() => new Map(allFoods.value.map((f) => [f.id, f])))

// Просмотр без поиска: История по дням (свежие сверху, внутри дня — в
// порядке добавления), Продукты/Блюда — весь список.
const historyByDay = computed(() => {
  const byDate = new Map<string, Entry[]>()
  for (const e of allEntries.value) {
    const list = byDate.get(e.date) ?? []
    list.push(e)
    byDate.set(e.date, list)
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({ date, entries: entries.sort(byCreatedAt) }))
})
const products = computed(() =>
  allFoods.value
    .filter((f) => f.kind === 'product' && matchesQuery(query.value, f.name, f.brand))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
)
const dishes = computed(() =>
  allFoods.value
    .filter((f) => f.kind === 'dish' && matchesQuery(query.value, f.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
)

// Поиск: все разделы сразу блоками, каждый продукт — один раз, в самом
// верхнем блоке, где нашёлся (История → Продукты → Блюда → База; см.
// README «Поиск»). В Истории при поиске — по одной, самой свежей записи
// на продукт, а не всё подряд: ищут, чтобы быстро добавить снова, а не
// пролистать историю целиком (для этого есть режим без поиска)
const historySearchRows = computed(() => {
  const matched = allEntries.value.filter((e) => e.foodId && matchesQuery(query.value, e.name, e.brand))
  const latestByFood = new Map<string, Entry>()
  for (const e of matched) {
    const prev = latestByFood.get(e.foodId!)
    if (!prev || e.createdAt > prev.createdAt) latestByFood.set(e.foodId!, e)
  }
  return [...latestByFood.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})
const usedAfterHistory = computed(() => new Set(historySearchRows.value.map((e) => e.foodId!)))
const productsSearchRows = computed(() => products.value.filter((f) => !usedAfterHistory.value.has(f.id)))
const usedAfterProducts = computed(
  () => new Set([...usedAfterHistory.value, ...productsSearchRows.value.map((f) => f.id)]),
)
const dishesSearchRows = computed(() => dishes.value.filter((f) => !usedAfterProducts.value.has(f.id)))

// router.push на конкретный день, а не router.back(): экран добавления
// может быть открыт без записи в истории браузера (прямая ссылка,
// перезагрузка страницы) — back() в этом случае улетает в about:blank,
// поймала на тесте.
async function quickAdd(food: Food) {
  await addEntryFromFood(food, props.date, target.value, food.lastGrams ?? 100)
  void router.push(`/day/${props.date}`)
}
function quickAddFromEntry(entry: Entry) {
  if (!entry.foodId) return // из каталога — появится в этапе 2/3
  const food = foodsById.value.get(entry.foodId)
  if (food) void quickAdd(food)
}

const openingFood = ref<Food | null>(null)
function openEntry(entry: Entry) {
  if (!entry.foodId) return
  const food = foodsById.value.get(entry.foodId)
  if (food) openingFood.value = food
}

const creatingKind = ref<'product' | 'dish' | null>(null)
async function onFoodSaved(id: string, addNow: boolean) {
  creatingKind.value = null
  if (!addNow) return
  const food = await db.foods.get(id)
  if (food) openingFood.value = food
}

function afterAdd() {
  openingFood.value = null
  void router.push(`/day/${props.date}`)
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
      </div>

      <div class="flex items-center gap-2">
        <input
          v-model="query"
          type="text"
          placeholder="Поиск…"
          class="flex-1 rounded-2xl bg-card border border-line px-4 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
        />
        <!-- Сканер штрихкода — этап 3 -->
        <button type="button" disabled class="w-10 h-10 rounded-2xl bg-card border border-line flex items-center justify-center text-muted/50 shrink-0">
          <ScanLine :size="18" />
        </button>
      </div>

      <!-- Вкладки — только пока не ищем; при поиске все разделы показываются сразу блоками -->
      <div v-if="!searching" class="flex gap-1 text-sm">
        <button type="button" @click="tab = 'history'" class="flex-1 py-2 rounded-xl" :class="tab === 'history' ? 'bg-accent text-white' : 'text-muted'">История</button>
        <button type="button" @click="tab = 'products'" class="flex-1 py-2 rounded-xl" :class="tab === 'products' ? 'bg-accent text-white' : 'text-muted'">Продукты</button>
        <button type="button" @click="tab = 'dishes'" class="flex-1 py-2 rounded-xl" :class="tab === 'dishes' ? 'bg-accent text-white' : 'text-muted'">Блюда</button>
        <!-- База (каталог) — этап 2 -->
        <button type="button" disabled class="flex-1 py-2 rounded-xl text-muted/40">База</button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto px-4 pb-6">
      <!-- Поиск: блоки по очереди, каждый продукт один раз -->
      <template v-if="searching">
        <template v-if="historySearchRows.length">
          <h3 class="text-xs text-muted mb-1.5 px-1">История</h3>
          <div class="rounded-2xl bg-card border border-line overflow-hidden mb-4">
            <FoodListRow
              v-for="entry in historySearchRows"
              :key="entry.id"
              :title="entry.name"
              :trailing="`${entry.grams} г`"
              @open="openEntry(entry)"
              @add="quickAddFromEntry(entry)"
            />
          </div>
        </template>
        <template v-if="productsSearchRows.length">
          <h3 class="text-xs text-muted mb-1.5 px-1">Продукты</h3>
          <div class="rounded-2xl bg-card border border-line overflow-hidden mb-4">
            <FoodListRow
              v-for="food in productsSearchRows"
              :key="food.id"
              :title="food.name"
              :subtitle="food.brand"
              @open="openingFood = food"
              @add="quickAdd(food)"
            />
          </div>
        </template>
        <template v-if="dishesSearchRows.length">
          <h3 class="text-xs text-muted mb-1.5 px-1">Блюда</h3>
          <div class="rounded-2xl bg-card border border-line overflow-hidden mb-4">
            <FoodListRow
              v-for="food in dishesSearchRows"
              :key="food.id"
              :title="food.name"
              @open="openingFood = food"
              @add="quickAdd(food)"
            />
          </div>
        </template>
        <p v-if="!historySearchRows.length && !productsSearchRows.length && !dishesSearchRows.length" class="text-sm text-muted py-6 text-center">
          Ничего не нашлось
        </p>
        <!-- База — этап 2, для нее нужен сервер -->
      </template>

      <!-- Без поиска: вкладки -->
      <template v-else-if="tab === 'history'">
        <p v-if="historyByDay.length === 0" class="text-sm text-muted py-6 text-center">Пока пусто</p>
        <div v-for="group in historyByDay" :key="group.date" class="mb-4">
          <h3 class="text-xs text-muted mb-1.5 px-1">
            {{ group.date === date ? 'Сегодня' : capitalizeFirst(formatDateWithWeekday(group.date)) }}
          </h3>
          <div class="rounded-2xl bg-card border border-line overflow-hidden">
            <FoodListRow
              v-for="entry in group.entries"
              :key="entry.id"
              :title="entry.name"
              :trailing="`${entry.grams} г`"
              @open="openEntry(entry)"
              @add="quickAddFromEntry(entry)"
            />
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'products'">
        <div class="rounded-2xl bg-card border border-line overflow-hidden mb-3">
          <p v-if="products.length === 0" class="px-4 py-3 text-sm text-muted">Ничего нет</p>
          <FoodListRow
            v-for="food in products"
            :key="food.id"
            :title="food.name"
            :subtitle="food.brand"
            @open="openingFood = food"
            @add="quickAdd(food)"
          />
        </div>
        <button type="button" @click="creatingKind = 'product'" class="text-sm text-accent px-1">+ Новый продукт</button>
      </template>

      <template v-else-if="tab === 'dishes'">
        <div class="rounded-2xl bg-card border border-line overflow-hidden mb-3">
          <p v-if="dishes.length === 0" class="px-4 py-3 text-sm text-muted">Ничего нет</p>
          <FoodListRow
            v-for="food in dishes"
            :key="food.id"
            :title="food.name"
            @open="openingFood = food"
            @add="quickAdd(food)"
          />
        </div>
        <button type="button" @click="creatingKind = 'dish'" class="text-sm text-accent px-1">+ Новое блюдо</button>
      </template>
    </div>

    <MealTargetSheet v-if="pickingTarget" :date="date" @close="pickingTarget = false" @pick="pickTarget" />
    <AddEntrySheet v-if="openingFood" :food="openingFood" :date="date" :target="target" @close="openingFood = null" @added="afterAdd" />
    <FoodFormSheet v-if="creatingKind" :kind="creatingKind" @close="creatingKind = null" @saved="onFoodSaved" />
  </div>
</template>
