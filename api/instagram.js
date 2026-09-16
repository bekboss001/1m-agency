// Instagram через Graph API. Токен Meta живёт на сервере, как и в meta-insights.
//
// Два действия:
//   accounts — перечислить бизнес-аккаунты Instagram, доступные токену;
//   stats    — посчитать посты одного аккаунта за период.
//
// Считаются посты, карусели и reels — всё, что попадает в /media. Сторис туда
// не входят: у них отдельная точка и время жизни сутки, суточный пересчёт их
// всё равно не поймал бы. По решению заказчика сторис в план не входят.

import { anchorDay, periodOf, previousPeriod, astanaToday } from '../server/contractPeriod.js'
import { matchPeriod, offPlanReason } from '../server/matchPosts.js'
import { buildLedger } from '../server/ledger.js'
import { GRAPH, collect, fetchFeed } from '../server/igMedia.js'
import { computeSync, rowIssues, feedStart } from '../server/syncEngine.js'

async function getJson(url) {
  const res = await fetch(url)
  return res.json()
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' })

  const metaToken = (process.env.META_ACCESS_TOKEN || '').trim().replace(/^["']|["']$/g, '')
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!metaToken) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет META_ACCESS_TOKEN' })
  if (!supabaseUrl || !supabaseAnonKey) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет доступа к Supabase' })

  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!accessToken) return res.status(401).json({ error: 'Не авторизован' })

  const sbHeaders = { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: sbHeaders })
  if (!userRes.ok) return res.status(401).json({ error: 'Сессия недействительна' })
  const user = await userRes.json()

  const action = req.body?.action

  // Права проверяем не одинаково для всех действий. Перечисление аккаунтов —
  // это обход всех бизнес-портфолио агентства, он остаётся за администратором.
  // Статистику по одному аккаунту смотрит любой вошедший: её открывают из
  // карточки клиента, в том числе сотрудники со своих телефонов. Проверка
  // сверки с КП тоже админская: она читает план и ленту всех клиентов подряд.
  if (action === 'accounts' || action === 'preview') {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`,
      { headers: sbHeaders },
    )
    const [profile] = profileRes.ok ? await profileRes.json() : []
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' })
  }

  /* ─────────────────────────── Список аккаунтов ─────────────────────────── */

  if (action === 'accounts') {
    try {
      const found = new Map()
      const fields = 'name,instagram_business_account%7Bid,username%7D'

      // Страницы, где админ сам пользователь.
      const own = await collect(`${GRAPH}/me/accounts?fields=${fields}&limit=100&access_token=${metaToken}`)
      for (const p of own.out) {
        if (p.instagram_business_account) {
          found.set(p.instagram_business_account.id, {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username,
            page_name: p.name,
            business_name: null,
          })
        }
      }

      // Страницы клиентов лежат в их собственных портфолио, а не в нашем —
      // через /me/accounts они не видны, только через обход бизнесов.
      const biz = await collect(`${GRAPH}/me/businesses?fields=id,name&limit=100&access_token=${metaToken}`)
      if (biz.error) {
        return res.status(502).json({
          error: biz.error.code === 100
            ? 'Токену не хватает разрешения business_management'
            : biz.error.message,
        })
      }

      for (const b of biz.out) {
        for (const edge of ['owned_pages', 'client_pages']) {
          const r = await collect(`${GRAPH}/${b.id}/${edge}?fields=${fields}&limit=100&access_token=${metaToken}`)
          for (const p of r.out) {
            if (!p.instagram_business_account) continue
            const ig = p.instagram_business_account
            if (!found.has(ig.id)) {
              found.set(ig.id, { id: ig.id, username: ig.username, page_name: p.name, business_name: b.name })
            }
          }
        }
      }

      const list = [...found.values()].sort((a, b) => a.username.localeCompare(b.username))
      return res.status(200).json({ accounts: list, portfolios: biz.out.length })
    } catch (e) {
      console.error('instagram accounts:', e)
      return res.status(502).json({ error: 'Не удалось получить список аккаунтов' })
    }
  }

  /* ──────────────────────── Статистика по аккаунту ──────────────────────── */

  // Два режима счёта:
  //   after         — публикации строго позже указанного момента (доборный
  //                   пересчёт, которым пользуется кнопка «Подтянуть»);
  //   since + until — публикации внутри окна (первая сверка, когда точки
  //                   отсчёта ещё нет).
  if (action === 'stats') {
    const { accountId, since, until, after } = req.body || {}
    const DATE = /^\d{4}-\d{2}-\d{2}$/

    if (!/^\d{5,32}$/.test(String(accountId ?? ''))) {
      return res.status(400).json({ error: 'Некорректный accountId' })
    }

    const afterMs = after ? Date.parse(after) : null
    if (after && Number.isNaN(afterMs)) {
      return res.status(400).json({ error: 'Некорректный момент отсчёта' })
    }
    if (!after && (!DATE.test(String(since ?? '')) || !DATE.test(String(until ?? '')))) {
      return res.status(400).json({ error: 'Некорректные даты периода' })
    }

    try {
      // Лента отсортирована от свежих к старым, поэтому обход можно прервать,
      // как только записи ушли за нижнюю границу.
      const url = `${GRAPH}/${accountId}/media?fields=id,timestamp,media_type&limit=100&access_token=${metaToken}`
      const { out, error } = await collect(url, items => {
        const last = items[items.length - 1]
        if (!last) return false
        return afterMs !== null
          ? Date.parse(last.timestamp) <= afterMs
          : last.timestamp.slice(0, 10) < since
      })

      if (error) {
        return res.status(502).json({
          error: error.code === 190
            ? 'Токен Meta не принят. Проверьте META_ACCESS_TOKEN в настройках Vercel.'
            : error.message,
        })
      }

      const picked = afterMs !== null
        ? out.filter(m => Date.parse(m.timestamp) > afterMs)
        : out.filter(m => {
            const d = m.timestamp.slice(0, 10)
            return d >= since && d <= until
          })

      // Последняя публикация — по всей ленте, а не только по выборке: если за
      // период не публиковали, важно знать, когда публиковали в прошлый раз.
      const lastPost = out.length ? out[0].timestamp.slice(0, 10) : null

      return res.status(200).json({
        count: picked.length,
        lastPost,
        // Точный момент самой свежей публикации в ленте — он становится новой
        // точкой отсчёта. Именно момент, а не дата: если за день вышло два
        // поста, по дате их не различить и один потерялся бы.
        lastAt: out.length ? out[0].timestamp : null,
        byType: {
          image: picked.filter(m => m.media_type === 'IMAGE').length,
          video: picked.filter(m => m.media_type === 'VIDEO').length,
          carousel: picked.filter(m => m.media_type === 'CAROUSEL_ALBUM').length,
        },
      })
    } catch (e) {
      console.error('instagram stats:', e)
      return res.status(502).json({ error: 'Не удалось получить статистику' })
    }
  }

  /* ─────────────────────── Аналитика по аккаунту ───────────────────────── */

  if (action === 'analytics') {
    const { accountId, since, until } = req.body || {}
    const DATE = /^\d{4}-\d{2}-\d{2}$/

    if (!/^\d{5,32}$/.test(String(accountId ?? ''))) {
      return res.status(400).json({ error: 'Некорректный accountId' })
    }
    if (!DATE.test(String(since ?? '')) || !DATE.test(String(until ?? ''))) {
      return res.status(400).json({ error: 'Некорректные даты периода' })
    }

    try {
      const profile = await getJson(
        `${GRAPH}/${accountId}?fields=username,followers_count,media_count&access_token=${metaToken}`,
      )
      if (profile.error) {
        return res.status(502).json({
          error: profile.error.code === 190
            ? 'Токен Meta не принят. Проверьте META_ACCESS_TOKEN в настройках Vercel.'
            : profile.error.message,
        })
      }

      // Каждую метрику запрашиваем отдельно: в одном запросе достаточно одного
      // неизвестного имени, чтобы Meta отклонила весь вызов, а состав метрик у
      // неё периодически меняется между версиями API.
      const from = Math.floor(Date.parse(since + 'T00:00:00Z') / 1000)
      const to = Math.floor(Date.parse(until + 'T23:59:59Z') / 1000)
      const insights = {}

      for (const metric of ['reach', 'profile_views', 'accounts_engaged']) {
        const r = await getJson(
          `${GRAPH}/${accountId}/insights?metric=${metric}&period=day&since=${from}&until=${to}&access_token=${metaToken}`,
        )
        if (r.error || !r.data?.length) continue
        const values = r.data[0].values || []
        insights[metric] = {
          total: values.reduce((s, v) => s + (v.value || 0), 0),
          series: values.map(v => ({ date: v.end_time.slice(0, 10), value: v.value || 0 })),
        }
      }

      // Лента за период — обход прерывается, как только записи стали старше начала.
      const media = await collect(
        `${GRAPH}/${accountId}/media?fields=id,timestamp,media_type,like_count,comments_count,permalink,caption&limit=100&access_token=${metaToken}`,
        items => {
          const last = items[items.length - 1]
          return last && last.timestamp.slice(0, 10) < since
        },
      )

      const posts = (media.out || []).filter(m => {
        const d = m.timestamp.slice(0, 10)
        return d >= since && d <= until
      })

      const likes = posts.reduce((s, p) => s + (p.like_count || 0), 0)
      const comments = posts.reduce((s, p) => s + (p.comments_count || 0), 0)

      // Разбивка по форматам: без неё нельзя ответить на главный вопрос
      // контент-плана — что снимать больше, а что не окупает съёмку.
      const byType = {}
      for (const p of posts) {
        const t = p.media_type || 'OTHER'
        const b = byType[t] || (byType[t] = { count: 0, likes: 0, comments: 0 })
        b.count++
        b.likes += p.like_count || 0
        b.comments += p.comments_count || 0
      }
      for (const b of Object.values(byType)) {
        b.avgEngagement = Math.round((b.likes + b.comments) / b.count)
      }

      const top = [...posts]
        .sort((a, b) => ((b.like_count || 0) + (b.comments_count || 0)) - ((a.like_count || 0) + (a.comments_count || 0)))
        .slice(0, 3)
        .map(p => ({
          date: p.timestamp.slice(0, 10),
          type: p.media_type,
          likes: p.like_count || 0,
          comments: p.comments_count || 0,
          permalink: p.permalink,
          caption: (p.caption || '').slice(0, 90),
        }))

      return res.status(200).json({
        profile: {
          username: profile.username,
          followers: profile.followers_count ?? null,
          mediaCount: profile.media_count ?? null,
        },
        insights,
        posts: {
          count: posts.length,
          likes,
          comments,
          avgLikes: posts.length ? Math.round(likes / posts.length) : 0,
          avgComments: posts.length ? Math.round((comments / posts.length) * 10) / 10 : 0,
          lastPost: media.out?.[0]?.timestamp.slice(0, 10) || null,
          byType,
        },
        top,
      })
    } catch (e) {
      console.error('instagram analytics:', e)
      return res.status(502).json({ error: 'Не удалось получить аналитику' })
    }
  }

  /* ─────────────── Сверка с контент-планом: проверка без записи ─────────────── */

  // Показывает то же, что запишет сверка (api/sync.js), но ничего не пишет:
  // расчёт один, server/syncEngine.js. Сверх записи отчёт показывает связь
  // публикаций с контент-планом и историю месяцев за год.
  if (action === 'preview') {
    const clientId = String(req.body?.clientId ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
      return res.status(400).json({ error: 'Некорректный clientId' })
    }

    const sb = async path => {
      const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: sbHeaders })
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`)
      return r.json()
    }

    try {
      const [client] = await sb(
        `clients?select=id,name,is_active,total_posts,published_posts,carry_posts,period_plan,period_day,last_post_date,contract_end,instagram_synced_at,instagram_account_id,instagram_username&id=eq.${clientId}`,
      )
      if (!client) return res.status(404).json({ error: 'Клиент не найден' })

      const head = {
        clientId,
        name: client.name,
        account: client.instagram_username || null,
        // Очередь: таблицу ещё ведут руками; периоды: её уже ведёт сверка.
        state: client.carry_posts === null ? 'queue' : 'periods',
        table: {
          planned: client.total_posts || 0,
          counted: client.published_posts || 0,
          carry: client.carry_posts,
          deadline: client.contract_end || null,
          lastPost: client.last_post_date || null,
        },
      }

      if (!client.is_active) return res.status(200).json({ ...head, skipped: 'stopped' })
      if (!client.instagram_account_id) return res.status(200).json({ ...head, skipped: 'no_account' })

      const today = astanaToday()
      const HISTORY = 12
      const issues = rowIssues(client, today)

      // Дни периодов: из сохранённого дня, иначе из «Договор до», иначе календарь.
      const anchor = client.period_day || anchorDay(client.contract_end)
      const monthNow = periodOf(anchor, today)
      let oldest = monthNow
      for (let i = 0; i < HISTORY; i++) oldest = previousPeriod(anchor, oldest)
      const since = issues.length
        ? oldest.startsOn
        : [oldest.startsOn, feedStart(client, today)].sort()[0]

      const [{ media, error: feedError }, posts] = await Promise.all([
        fetchFeed(client.instagram_account_id, since, metaToken),
        sb(
          `posts?select=id,title,publish_date,post_type,status&client_id=eq.${clientId}`
          + `&publish_date=gte.${monthNow.startsOn}&publish_date=lt.${monthNow.endsOn}&order=publish_date`,
        ),
      ])
      if (feedError) return res.status(502).json({ error: feedError })

      const sync = issues.length ? null : computeSync({ row: client, media, today })

      // Текущий период: из расчёта записи, а если писать нельзя, только факт.
      const current = sync
        ? sync.current
        : { ...monthNow, planned: client.total_posts || 0, carryIn: null, due: null, done: media.filter(m => m.date >= monthNow.startsOn && m.date < monthNow.endsOn).length, carryOut: null }

      // История: итог каждого месяца отдельно. Перенос между прошлыми месяцами
      // хранится в client_months и показывается в карточке клиента.
      const history = buildLedger({
        planned: client.total_posts || 0, anchor, today, pubs: media.map(m => m.date), baseline: null, depth: HISTORY,
      }).history

      const inCurrent = media.filter(m => m.date >= current.startsOn && m.date < current.endsOn)
      const plan = posts.filter(p => p.post_type !== 'stories')
      const { links, unmatched } = matchPeriod(inCurrent, plan)

      const clock = ms => new Date(ms + 5 * 3600 * 1000).toISOString().slice(11, 16)
      const brief = p => ({ id: p.id, title: p.title, date: p.publish_date, type: p.post_type, status: p.status })
      const reasonBase = current.due === null ? { planned: current.planned, due: current.planned } : current

      return res.status(200).json({
        ...head,
        today,
        anchor,
        planned: current.planned,
        issues,
        patch: sync?.patch || null,
        closed: sync?.closed || [],
        lastPost: media.length ? media[media.length - 1].date : null,
        current: {
          ...current,
          kpCount: plan.length,
          kpStories: posts.length - plan.length,
          links: links.map((l, i) => ({
            date: l.media.date,
            time: clock(l.media.ms),
            kind: l.media.kind,
            permalink: l.media.permalink,
            caption: l.media.caption,
            post: l.post ? brief(l.post) : null,
            sameType: l.sameType,
            shift: l.shift,
            tie: l.tie,
            reason: l.post ? null : offPlanReason(i + 1, reasonBase),
          })),
          unmatched: unmatched.map(p => ({
            ...brief(p),
            // Отмечен руками, но в Instagram пары нет; не вышел в срок; ещё впереди.
            state: p.status === 'published' ? 'manual' : p.publish_date < today ? 'overdue' : 'upcoming',
          })),
        },
        history,
      })
    } catch (e) {
      console.error('instagram preview:', e)
      return res.status(502).json({ error: 'Не удалось построить отчёт: ' + e.message })
    }
  }

  return res.status(400).json({ error: 'Неизвестное действие' })
}
