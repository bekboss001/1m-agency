// Автоматическая сверка с Instagram: считает и записывает в таблицу клиентов.
//
// Два способа запуска:
//   GET  — Vercel Cron раз в сутки. Работает без вошедшего пользователя, поэтому
//          пишет серверным ключом Supabase. Vercel подписывает запрос
//          CRON_SECRET, без совпадения запрос отклоняется.
//   POST — из приложения: при открытии администратором и кнопкой «Обновить
//          сейчас». Пишет от имени вошедшего администратора. В теле можно
//          передать clientId, чтобы пересчитать одного клиента.
//
// Сам расчёт в api/syncEngine.js, он же показывается в отчёте проверки.
// Повторный запуск безопасен: окно периода каждый раз пересчитывается заново.

import { astanaToday } from './contractPeriod.js'
import { fetchFeed } from './igMedia.js'
import { computeSync, rowIssues, feedStart } from './syncEngine.js'

const CLIENT_COLUMNS = [
  'id', 'name', 'total_posts', 'published_posts', 'carry_posts', 'period_plan', 'period_day',
  'contract_end', 'last_post_date', 'instagram_synced_at', 'instagram_account_id',
].join(',')

// Какие колонки сверка может менять. Всё прочее в строке клиента не трогается.
const PATCH_COLUMNS = [
  'contract_end', 'published_posts', 'carry_posts', 'period_plan', 'period_day',
  'last_post_date', 'instagram_synced_at',
]

const PARALLEL = 3

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  const metaToken = (process.env.META_ACCESS_TOKEN || '').trim().replace(/^["']|["']$/g, '')
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!metaToken) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет META_ACCESS_TOKEN' })
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет доступа к Supabase' })

  let headers
  let clientId = null

  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Не авторизован' })
    }
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет SUPABASE_SERVICE_ROLE_KEY' })
    headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  } else if (req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Не авторизован' })
    headers = { apikey: anonKey, Authorization: `Bearer ${token}` }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers })
    if (!userRes.ok) return res.status(401).json({ error: 'Сессия недействительна' })
    const user = await userRes.json()

    // Сверка переписывает счётчики всех клиентов, поэтому только администратор.
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`,
      { headers },
    )
    const [profile] = profileRes.ok ? await profileRes.json() : []
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' })

    if (req.body?.clientId !== undefined) {
      clientId = String(req.body.clientId)
      if (!/^[0-9a-f-]{36}$/i.test(clientId)) return res.status(400).json({ error: 'Некорректный clientId' })
    }
  } else {
    return res.status(405).json({ error: 'Метод не поддерживается' })
  }

  const rest = async (method, path, body, prefer) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        ...headers,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await r.text()
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  }

  try {
    const filter = clientId
      ? `id=eq.${clientId}`
      : 'is_active=eq.true&instagram_account_id=not.is.null'
    const rows = await rest('GET', `clients?select=${CLIENT_COLUMNS}&${filter}&order=number`)
    const today = astanaToday()

    const results = []
    const queue = [...rows]
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift()
        results.push(await syncOne(row, today, metaToken, rest))
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))

    results.sort((a, b) => a.name.localeCompare(b.name))
    return res.status(200).json({ today, results })
  } catch (e) {
    console.error('sync:', e)
    return res.status(502).json({ error: 'Сверка не выполнена: ' + e.message })
  }
}

async function syncOne(row, today, metaToken, rest) {
  const base = { id: row.id, name: row.name }
  if (!row.instagram_account_id) return { ...base, skipped: 'no_account' }

  // Проблемы строки проверяем до обращения к Instagram: запрос ленты не нужен,
  // если записывать всё равно нельзя.
  const issues = rowIssues(row, today)
  if (issues.length) return { ...base, issues }

  try {
    const { media, error } = await fetchFeed(row.instagram_account_id, feedStart(row, today), metaToken)
    if (error) return { ...base, error }

    const result = computeSync({ row, media, today })
    if (!result.patch) return { ...base, issues: result.issues }

    // Сначала история, потом клиент. Если запись клиента не пройдёт, следующий
    // прогон начнёт с прежнего состояния и закроет те же периоды теми же
    // числами: upsert по (client_id, period) не создаст дублей.
    if (result.closed.length) {
      await rest(
        'POST',
        'client_months?on_conflict=client_id,period',
        result.closed.map(c => ({
          client_id: row.id,
          period: c.startsOn,
          starts_on: c.startsOn,
          ends_on: c.endsOn,
          planned: c.planned,
          done: c.done,
          carry_in: c.carryIn,
          carry_out: c.carryOut,
        })),
        'resolution=merge-duplicates,return=minimal',
      )
    }

    const changes = Object.fromEntries(
      PATCH_COLUMNS
        .filter(k => k in result.patch && !same(row[k], result.patch[k]))
        .map(k => [k, result.patch[k]]),
    )

    if (Object.keys(changes).length) {
      const updated = await rest(
        'PATCH',
        `clients?id=eq.${row.id}`,
        changes,
        'return=representation',
      )
      // Права на строку могут молча отсечь запись: успех без строк это отказ.
      if (!updated?.length) return { ...base, error: 'База не разрешила запись' }
    }

    return {
      ...base,
      changed: Object.keys(changes),
      closed: result.closed,
      current: result.current,
    }
  } catch (e) {
    return { ...base, error: e.message }
  }
}

// Даты и время из базы приходят в другом виде, чем их пишет расчёт:
// '2026-09-16T08:00:00+00:00' против '2026-09-16T08:00:00.000Z'.
function same(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (typeof a === 'string' && typeof b === 'string' && !Number.isNaN(ta) && ta === tb) return true
  return false
}
