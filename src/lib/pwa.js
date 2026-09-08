// Регистрация service worker и подхват обновлений.
//
// Без этого установленное на телефон приложение живёт на той версии, что была
// в момент установки: новый worker встаёт в очередь и ждёт, пока закроются все
// вкладки, а у приложения на домашнем экране вкладка одна и она не закрывается.
// Поэтому новый worker просим активироваться сразу и один раз перезагружаем
// страницу — так деплой доезжает до телефона сам.

export function registerSW() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    let reg
    try {
      reg = await navigator.serviceWorker.register('/sw.js')
    } catch {
      return
    }

    // Один раз: без флага смена контроллера уводит страницу в цикл перезагрузок.
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })

    const promote = worker => {
      if (!worker) return
      worker.addEventListener('statechange', () => {
        // Ждём именно installed при живом контроллере: это и есть «есть новая
        // версия». Без контроллера это первая установка, перезагружать нечего.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage('skip-waiting')
        }
      })
    }

    if (reg.waiting && navigator.serviceWorker.controller) {
      reg.waiting.postMessage('skip-waiting')
    }
    promote(reg.installing)
    reg.addEventListener('updatefound', () => promote(reg.installing))

    // Возврат к приложению с домашнего экрана — хороший момент проверить
    // обновление: другого «перезапуска» у установленного PWA не бывает.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  })
}

// Приложение запущено с домашнего экрана, а не во вкладке браузера.
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIOS() {
  const ua = navigator.userAgent
  // iPadOS 13+ представляется Macintosh, отличаем по тач-точкам.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
