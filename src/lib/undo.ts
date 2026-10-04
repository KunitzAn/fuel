// Плашка «Удалено · Отменить» внизу экрана (владелица: после свайпа можно
// и не заметить, что еда удалилась). Одна на приложение — UndoToast.vue в
// App.vue; новое удаление заменяет прошлую плашку, прошлое остаётся удалённым.
import { ref } from 'vue'

export interface UndoState {
  message: string
  undo: () => Promise<void> | void
}

export const UNDO_MS = 5000

export const undoState = ref<UndoState | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

export function offerUndo(message: string, undo: UndoState['undo']) {
  clearTimeout(timer)
  undoState.value = { message, undo }
  timer = setTimeout(() => (undoState.value = null), UNDO_MS)
}

export async function runUndo() {
  const state = undoState.value
  clearTimeout(timer)
  undoState.value = null
  await state?.undo()
}
