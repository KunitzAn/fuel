/**
 * Цвета статуса цифры дня (goals.ts → computeDayStatus): одни и те же в
 * дневнике, ленте и графиках статистики. `null` — ни цели, ни границ.
 */
import type { BoundStatus } from './goals'

const TEXT: Record<BoundStatus, string> = {
  under: 'text-amber-600',
  over: 'text-red-500',
  ok: 'text-green-600',
}
const FILL: Record<BoundStatus, string> = {
  under: 'fill-amber-500',
  over: 'fill-red-500',
  ok: 'fill-green-600',
}

export function statusTextClass(status: BoundStatus | null | undefined): string {
  return status ? TEXT[status] : 'text-muted'
}

export function statusFillClass(status: BoundStatus | null | undefined): string {
  return status ? FILL[status] : 'fill-muted'
}
