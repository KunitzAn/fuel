/**
 * Мутации записей дневника — центральное место для dirty/updatedAt/синка,
 * чтобы экраны не дублировали эту логику в каждом обработчике клика.
 */
import { db, type Entry, type Snack } from './db'
import { runSync } from './sync'

export type Meal = 'breakfast' | 'lunch' | 'dinner'

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
}

/** Родительный падеж — «перекус после завтрака/обеда/ужина» (не склоняется по правилу от именительного). */
export const MEAL_GENITIVE: Record<Meal, string> = {
  breakfast: 'завтрака',
  lunch: 'обеда',
  dinner: 'ужина',
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

/** Несколько перекусов после одного приёма — в порядке добавления. */
export function bySnackPosition(a: Snack, b: Snack): number {
  return a.position - b.position
}

export async function createSnack(date: string, after: Meal): Promise<void> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const position = await db.snacks
    .where('date')
    .equals(date)
    .and((s) => s.after === after && !s.deletedAt)
    .count()
  await db.snacks.add({ id, date, after, name: 'Перекус', position, createdAt: now, updatedAt: now, deletedAt: null, dirty: true })
  void runSync()
}

export async function renameSnack(id: string, name: string): Promise<void> {
  const now = new Date().toISOString()
  await db.snacks.update(id, { name: name.trim() || 'Перекус', updatedAt: now, dirty: true })
  void runSync()
}

/**
 * «Пустой перекус исчезает, когда уходишь с экрана» (README) — перекусы
 * без единой записи для этого дня гасим мягко при выходе из дневника.
 * Вызывается из DiaryView при уходе с экрана, не при каждом чихе — иначе
 * перекус, который только что создали и ещё не успели наполнить (переход
 * на экран добавления еды — тот же уход с маршрута), исчезал бы раньше,
 * чем пользователь до него доходил.
 */
export async function cleanupEmptySnacksForDate(date: string): Promise<void> {
  const snacksForDate = await db.snacks
    .where('date')
    .equals(date)
    .and((s) => !s.deletedAt)
    .toArray()
  if (snacksForDate.length === 0) return

  const entries = await db.entries
    .where('date')
    .equals(date)
    .and((e) => !e.deletedAt && e.snackId !== null)
    .toArray()
  const usedSnackIds = new Set(entries.map((e) => e.snackId))

  const now = new Date().toISOString()
  let changed = false
  for (const snack of snacksForDate) {
    if (!usedSnackIds.has(snack.id)) {
      await db.snacks.update(snack.id, { deletedAt: now, updatedAt: now, dirty: true })
      changed = true
    }
  }
  if (changed) void runSync()
}
