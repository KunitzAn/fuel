/**
 * Сколько еды — граммами или штуками (владелица, 22.10: «вода 1 кокоса —
 * 1 шт»). Считается всё по-прежнему в граммах: штуки — только способ их
 * ввести, `grams = штуки × вес 1 шт`. Общее для окна добавления
 * (AddEntrySheet) и правки записи (GramsEditSheet), поле — AmountField.vue.
 */
import { computed, reactive, ref } from 'vue'
import { parseDecimal } from './nutrition'

export type AmountUnit = 'g' | 'pcs'

/** «1», «0.5», «1.25» — без хвостовых нулей. */
export function formatPieces(n: number): string {
  return String(Number(n.toFixed(2)))
}

export function useAmount(o: {
  /** Граммы по умолчанию (с прошлого раза / этой записи). */
  grams: number
  /** Штуки по умолчанию; есть — открываемся сразу на «шт». */
  pieces: number | null
  /** Известный вес 1 шт. */
  pieceGrams: number | null
}) {
  const unit = ref<AmountUnit>(o.pieces !== null && o.pieceGrams ? 'pcs' : 'g')
  const defaultPieces = o.pieces ?? 1
  const gramsInput = ref(String(o.grams))
  const piecesInput = ref(formatPieces(defaultPieces))
  // Вес штуки можно вписать прямо тут — нет его у продукта, или поправить
  const pieceGramsInput = ref(o.pieceGrams ? String(o.pieceGrams) : '')
  const knownPieceGrams = ref(o.pieceGrams)

  const pieceGrams = computed(() => {
    const v = parseDecimal(pieceGramsInput.value)
    return v !== null && v > 0 ? v : null
  })
  const pieces = computed(() => parseDecimal(piecesInput.value) ?? defaultPieces)
  const grams = computed(() => {
    if (unit.value === 'g') return parseDecimal(gramsInput.value) ?? o.grams
    return pieceGrams.value === null ? 0 : Math.round(pieces.value * pieceGrams.value * 10) / 10
  })
  /** Для записи: штуками — сколько, граммами — null. */
  const entryPieces = computed(() => (unit.value === 'pcs' ? pieces.value : null))
  /** Вес штуки вписали или поменяли — его стоит запомнить у продукта. */
  const newPieceGrams = computed(() =>
    unit.value === 'pcs' && pieceGrams.value !== null && pieceGrams.value !== knownPieceGrams.value ? pieceGrams.value : null,
  )

  // Тап по полю очищает его (владелица): прошлое значение — подсказкой, и
  // пока поле пустое, считаем по нему
  function clearOnFocus() {
    if (unit.value === 'g' && gramsInput.value === String(o.grams)) gramsInput.value = ''
    if (unit.value === 'pcs' && piecesInput.value === formatPieces(defaultPieces)) piecesInput.value = ''
  }
  /** Вес штуки узнали позже (подгрузили продукт) — подставить, если не вписан. */
  function knowPieceGrams(g: number) {
    knownPieceGrams.value = g
    if (!pieceGramsInput.value) pieceGramsInput.value = String(g)
  }

  return reactive({
    unit,
    gramsInput,
    piecesInput,
    pieceGramsInput,
    defaultGrams: o.grams,
    defaultPieces,
    pieceGrams,
    pieces,
    grams,
    entryPieces,
    newPieceGrams,
    clearOnFocus,
    knowPieceGrams,
  })
}

export type Amount = ReturnType<typeof useAmount>
