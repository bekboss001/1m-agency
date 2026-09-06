// Serverless-прокси к Meta Marketing API.
//
// Токен живёт здесь и в браузер не попадает: переменная называется
// META_ACCESS_TOKEN без префикса VITE_, поэтому Vite её в бандл не вшивает.
//
// Это не сквозной прокси: наружу торчат ровно два GET-запроса статистики,
// параметры которых валидируются ниже. Записать что-либо в рекламный кабинет
// через эту функцию нельзя.

const GRAPH = 'https://graph.facebook.com/v19.0'
const FIELDS = 'reach,impressions,clicks,ctr,spend,actions,cost_per_action_type'
const DATE_PRESETS = new Set(['yesterday', 'today', 'last_7d', 'last_30d', 'this_month'])

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' })
  }

  // Токен часто копируют из .env вместе с переносом строки или кавычками —
  // Meta на такое отвечает «Cannot parse access token». Чистим на входе.
  const metaToken = (process.env.META_ACCESS_TOKEN || '').trim().replace(/^["']|["']$/g, '')

  // Адрес и anon-ключ Supabase публичны by design — они и так лежат в клиентском
  // бандле, поэтому переиспользуем уже заведённые VITE_-переменные, а не заводим
  // их вторыми копиями. Префикс VITE_ ограничивает только сборку клиента; на
  // сервере читается любая переменная. С токеном Meta так нельзя: у него префикса
  // быть не должно, иначе Vite вошьёт его в бандл — ровно так он и утёк.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!metaToken) {
    console.error('meta-insights: не задан META_ACCESS_TOKEN')
    return res.status(500).json({ error: 'Сервер не сконфигурирован: нет META_ACCESS_TOKEN' })
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('meta-insights: не заданы переменные Supabase')
    return res.status(500).json({ error: 'Сервер не сконфигурирован: нет доступа к Supabase' })
  }

  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!accessToken) return res.status(401).json({ error: 'Не авторизован' })

  const sbHeaders = { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` }

  // Кто зовёт. Токен сессии проверяет сам Supabase — своей проверки подписи здесь нет.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: sbHeaders })
  if (!userRes.ok) return res.status(401).json({ error: 'Сессия недействительна' })
  const user = await userRes.json()

  // Та же проверка роли, что и на самой странице «Таргет».
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`,
    { headers: sbHeaders },
  )
  const [profile] = profileRes.ok ? await profileRes.json() : []
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' })

  const { accountId, datePreset } = req.body || {}
  // Мобильному экрану кампании не нужны, зато нужен ряд по дням для спарклайна;
  // десктопному — наоборот. Оба флага только включают/выключают наши же запросы.
  const withCampaigns = req.body?.withCampaigns !== false
  const withSeries = req.body?.withSeries === true

  if (!/^\d{1,32}$/.test(String(accountId ?? ''))) {
    return res.status(400).json({ error: 'Некорректный accountId' })
  }
  if (!DATE_PRESETS.has(datePreset)) {
    return res.status(400).json({ error: 'Некорректный период' })
  }

  // Токен видит все кабинеты бизнес-менеджера, а приложению нужны только те,
  // что привязаны к клиентам — иначе любой админ мог бы вытащить чужую статистику.
  const clientRes = await fetch(
    `${supabaseUrl}/rest/v1/clients?select=id&meta_account_id=eq.${encodeURIComponent(accountId)}&limit=1`,
    { headers: sbHeaders },
  )
  const [client] = clientRes.ok ? await clientRes.json() : []
  if (!client) {
    return res.status(403).json({ error: 'Рекламный кабинет не привязан ни к одному клиенту' })
  }

  const base = `${GRAPH}/act_${accountId}`
  const insightsParams = new URLSearchParams({
    fields: FIELDS,
    date_preset: datePreset,
    access_token: metaToken,
  })

  const seriesParams = new URLSearchParams({
    fields: 'spend',
    date_preset: datePreset,
    time_increment: '1',
    access_token: metaToken,
  })

  try {
    const [insightsRes, campaignsRes, seriesRes] = await Promise.all([
      fetch(`${base}/insights?${insightsParams}`),
      withCampaigns
        ? fetch(
            `${base}/campaigns?fields=name,status,insights.date_preset(${datePreset}){${FIELDS}}` +
              `&limit=20&access_token=${encodeURIComponent(metaToken)}`,
          )
        : null,
      withSeries ? fetch(`${base}/insights?${seriesParams}`) : null,
    ])

    if (!insightsRes.ok) {
      const body = await insightsRes.json().catch(() => null)
      const meta = body?.error

      // 190 — проблема с самим токеном. Отвечаем так, чтобы было понятно, где
      // чинить: сообщение Meta про «cannot parse» ничего не говорит о том, что
      // виновата переменная окружения.
      if (meta?.code === 190) {
        console.error('meta-insights: токен отклонён Meta —', meta.message)
        return res.status(502).json({
          error: 'Токен Meta не принят. Проверьте META_ACCESS_TOKEN в настройках Vercel: значение должно быть без кавычек, пробелов и переносов строки.',
        })
      }

      // Наружу отдаём только текст ошибки Meta — не тело запроса и не URL с токеном.
      return res.status(502).json({ error: meta?.message || 'Ошибка Meta API' })
    }

    const insights = await insightsRes.json()
    const campaigns = campaignsRes?.ok ? await campaignsRes.json() : { data: [] }
    const series = seriesRes?.ok ? await seriesRes.json() : { data: [] }

    return res.status(200).json({
      stats: insights.data?.[0] || null,
      campaigns: campaigns.data || [],
      series: (series.data || []).map(d => ({ date: d.date_start, spend: parseFloat(d.spend) || 0 })),
    })
  } catch (e) {
    console.error('meta-insights: запрос к Meta не удался', e)
    return res.status(502).json({ error: 'Meta API недоступен' })
  }
}
