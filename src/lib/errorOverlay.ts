/**
 * Ошибки прямо на экране. В PWA с экрана «Домой» консоли не видно, а белый
 * экран ничего не говорит — при любой ошибке JS показываем поверх
 * приложения плашку с текстом, стеком и адресом, её можно заскриншотить.
 * Чистый DOM, без Vue: должна показаться, даже если сломался сам Vue.
 */
let box: HTMLDivElement | null = null

export function showError(source: string, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err))
  const text = [
    `${source}: ${e.message}`,
    `адрес: ${location.href}`,
    `онлайн: ${navigator.onLine ? 'да' : 'нет'}`,
    e.stack ?? '',
  ].join('\n')

  if (!box) {
    box = document.createElement('div')
    box.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;max-height:60vh;overflow:auto;' +
      'background:#7f1d1d;color:#fff;font:12px/1.4 ui-monospace,monospace;padding:12px;border-radius:12px;white-space:pre-wrap'
    box.addEventListener('click', () => {
      box?.remove()
      box = null
    })
    document.body.appendChild(box)
  }
  box.textContent = (box.textContent ? box.textContent + '\n\n' : '') + text + '\n(тап — закрыть)'
}

export function installErrorOverlay(): void {
  window.addEventListener('error', (ev) => showError('error', ev.error ?? ev.message))
  window.addEventListener('unhandledrejection', (ev) => showError('promise', ev.reason))
}
