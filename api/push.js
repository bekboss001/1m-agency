// Push-уведомления: то, что нужно браузеру при включении.
//
//   GET                — публичный VAPID-ключ. Он открытый по устройству
//                        протокола, браузер без него не выдаст подписку.
//                        Отдаём отсюда, а не через VITE_-переменную, чтобы ключ
//                        менялся без пересборки.
//   POST {action:test} — пробное уведомление на все устройства вошедшего.
//
// Плановые уведомления шлёт тик расписания: api/telegram.js → server/push.js.

import { pushConfig, webPushSender, sendToSubs } from '../server/push.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  const cfg = pushConfig()
  if (!cfg) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет VAPID-ключей' })

  if (req.method === 'GET') return res.status(200).json({ publicKey: cfg.publicKey })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет доступа к Supabase' })

  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return res.status(401).json({ error: 'Не авторизован' })

  // Под ключом пользователя: RLS отдаст только его собственные устройства.
  const rest = async (method, path) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method, headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
    })
    const text = await r.text()
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  }

  const action = req.body?.action
  if (action !== 'test') return res.status(400).json({ error: 'Неизвестное действие' })

  try {
    const subs = await rest('GET', 'push_subscriptions?select=endpoint,p256dh,auth')
    if (!subs?.length) return res.status(404).json({ error: 'На этом аккаунте нет подключённых устройств' })

    const { delivered, errors } = await sendToSubs(rest, webPushSender(cfg), subs, {
      title: 'Уведомления работают',
      body: 'Сюда будут приходить напоминания о съёмках.',
      url: '/profile',
      tag: 'push-test',
    }, 300)
    if (!delivered) return res.status(502).json({ error: 'Не доставлено: ' + (errors[0] || 'устройство отозвало подписку') })
    return res.status(200).json({ delivered, devices: subs.length })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  }
}
