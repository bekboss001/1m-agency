// Service worker приложения.
//
// Разделение по типам запросов, а не одна стратегия на всё:
//
//   навигация      — сеть вперёд, кэш как запасной аэродром. Иначе после
//                    деплоя человек сидел бы на старой оболочке, которая
//                    ссылается на уже удалённые файлы, и получал бы вечный
//                    спиннер вместо приложения.
//   /assets/*      — кэш вперёд. Имена этих файлов содержат хэш содержимого,
//                    поэтому кэшировать их навсегда безопасно: изменился
//                    файл — изменилось имя.
//   всё остальное  — мимо кэша. Запросы к Supabase и к нашим функциям должны
//                    падать честно, а не отдавать вчерашние данные.
//
// Версия в имени кэша: при её смене старые кэши сносятся в activate.

const VERSION = 'v3'
const SHELL = `1m-shell-${VERSION}`
const ASSETS = `1m-assets-${VERSION}`

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.add(new Request('/', { cache: 'reload' })))
      .catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys.filter(k => k !== SHELL && k !== ASSETS).map(k => caches.delete(k)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Навигация: сеть вперёд, свежий ответ кладём в кэш как оболочку.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req)
        const cache = await caches.open(SHELL)
        cache.put('/', res.clone())
        return res
      } catch {
        const cached = await caches.match('/', { cacheName: SHELL })
        return cached || new Response(
          '<meta charset="utf-8"><body style="font:16px system-ui;padding:40px;text-align:center">Нет сети</body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
      }
    })())
    return
  }

  // Файлы сборки: имя содержит хэш, поэтому кэш вперёд без ревалидации.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { cacheName: ASSETS })
      if (cached) return cached
      const res = await fetch(req)
      if (res.ok) (await caches.open(ASSETS)).put(req, res.clone())
      return res
    })())
  }
})

// Страница просит применить обновление немедленно.
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting()
})
