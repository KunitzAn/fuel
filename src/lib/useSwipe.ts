/**
 * Горизонтальный свайп на тач-устройствах: неделя (соседняя неделя) и
 * строка еды (удаление). Без библиотеки — один жест, дальше не растёт.
 *
 * Вертикальный скролл гасит жест: если путь по Y больше, чем по X,
 * считаем это прокруткой страницы, а не свайпом.
 */
export interface SwipeHandlers {
  onTouchstart: (e: TouchEvent) => void
  onTouchmove: (e: TouchEvent) => void
  onTouchend: (e: TouchEvent) => void
}

export function useSwipe(onLeft: () => void, onRight: () => void, threshold = 60): SwipeHandlers {
  let startX = 0
  let startY = 0
  let tracking = false

  return {
    onTouchstart(e: TouchEvent) {
      const t = e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      tracking = true
    },
    onTouchmove(e: TouchEvent) {
      if (!tracking) return
      const t = e.touches[0]
      if (!t) return
      // Жест уже явно горизонтальный — не даём странице проскроллиться вслед.
      if (Math.abs(t.clientX - startX) > Math.abs(t.clientY - startY)) {
        e.preventDefault()
      }
    },
    onTouchend(e: TouchEvent) {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return
      if (dx < 0) onLeft()
      else onRight()
    },
  }
}
