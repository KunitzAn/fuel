/**
 * Мутации записей дневника — центральное место для dirty/updatedAt/синка,
 * чтобы экраны не дублировали эту логику в каждом обработчике клика.
 */
import { db, type Entry } from './db'
import { runSync } from './sync'

export const MEAL_LABELS: Record<'breakfast' | 'lunch' | 'dinner', string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
}

export async function updateEntryGrams(id: string, grams: number): Promise<void> {
  const now = new Date().toISOString()
  await db.entries.update(id, { grams, updatedAt: now, dirty: true })
  void runSync()
}

export async function softDeleteEntry(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.entries.update(id, { deletedAt: now, updatedAt: now, dirty: true })
  void runSync()
}

/** Сортировка внутри дня/приёма — в порядке добавления (см. README «История»). */
export function byCreatedAt(a: Entry, b: Entry): number {
  return a.createdAt.localeCompare(b.createdAt)
}
