import { describe, expect, it } from 'vitest'
import { formatPieces, useAmount } from './amount'

describe('useAmount', () => {
  it('граммами по умолчанию, если штуками не брали', () => {
    const a = useAmount({ grams: 200, pieces: null, pieceGrams: 300 })
    expect(a.unit).toBe('g')
    expect(a.grams).toBe(200)
    expect(a.entryPieces).toBeNull()
    a.gramsInput = '150'
    expect(a.grams).toBe(150)
  })

  it('штуками, если брали штуками: граммы = штуки × вес штуки', () => {
    const a = useAmount({ grams: 300, pieces: 1, pieceGrams: 300 })
    expect(a.unit).toBe('pcs')
    expect(a.grams).toBe(300)
    a.piecesInput = '1,5'
    expect(a.grams).toBe(450)
    expect(a.entryPieces).toBe(1.5)
    expect(a.newPieceGrams).toBeNull() // вес штуки не трогали
  })

  it('пустое поле — считаем по прошлому значению', () => {
    const a = useAmount({ grams: 300, pieces: 2, pieceGrams: 150 })
    a.clearOnFocus()
    expect(a.piecesInput).toBe('')
    expect(a.grams).toBe(300)
  })

  it('без веса штуки «шт» даёт 0 г, пока его не впишут; вписанный — новый', () => {
    const a = useAmount({ grams: 100, pieces: null, pieceGrams: null })
    a.unit = 'pcs'
    expect(a.grams).toBe(0)
    a.pieceGramsInput = '320'
    expect(a.grams).toBe(320)
    expect(a.newPieceGrams).toBe(320)
  })

  it('вес штуки подгрузили позже — подставляется и не считается новым', () => {
    const a = useAmount({ grams: 100, pieces: null, pieceGrams: null })
    a.knowPieceGrams(60)
    a.unit = 'pcs'
    expect(a.grams).toBe(60)
    expect(a.newPieceGrams).toBeNull()
  })

  it('граммы округляются до десятых', () => {
    const a = useAmount({ grams: 100, pieces: 1, pieceGrams: 33.33 })
    a.piecesInput = '3'
    expect(a.grams).toBe(100)
  })
})

describe('formatPieces', () => {
  it('без хвостовых нулей', () => {
    expect(formatPieces(1)).toBe('1')
    expect(formatPieces(0.5)).toBe('0.5')
    expect(formatPieces(1.25)).toBe('1.25')
    expect(formatPieces(1 / 3)).toBe('0.33')
  })
})
