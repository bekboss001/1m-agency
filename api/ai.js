// Сценарист: чат с моделью, знающей контекст конкретного клиента.
//
// Ключ Anthropic живёт здесь и только здесь — в браузерный бандл он не попадает
// ни при каких условиях. Это тот же урок, что с токеном Meta: любая переменная
// с префиксом VITE_ оказывается в исходниках страницы.
//
// Ответ отдаётся потоком (SSE). Сценарий пишется секунд десять, и без потока
// человек всё это время смотрит на пустой экран, а запрос рискует упереться
// в таймаут функции.

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'
const GRAPH = 'https://graph.facebook.com/v19.0'

// Тарифы Claude Opus 5, $ за миллион токенов. Нужны, чтобы писать в журнал
// расхода живые деньги, а не абстрактные токены.
const PRICE = { input: 5, output: 25, cacheRead: 0.5 }

// Потолок реплик в час на человека. Не про экономию — про защиту от цикла,
// в котором интерфейс шлёт запрос сам себе.
const HOURLY_LIMIT = 80

const SYSTEM = `Ты — сценарист SMM-агентства 1M.AGENCY (Казахстан). Пишешь для Instagram: reels, карусели, посты, сторис.

Как ты работаешь:
— Пишешь на языке, на котором к тебе обратились. Если клиент казахоязычный — можешь предложить вариант на казахском.
— Сценарий reels даёшь съёмочно: крючок первых трёх секунд, раскадровка с хронометражом, текст в кадре, закадровый текст, призыв. Оператор должен взять и снять, не переспрашивая.
— Для постов и каруселей: заголовок, тело, призыв, хештеги отдельно.
— Опираешься на то, что у клиента уже заходило, если эти данные есть в контексте. Прямо ссылаешься на них: «карусели у вас собирают втрое больше реакций, поэтому предлагаю карусель».
— Не выдумываешь фактов о продукте. Если для сценария нужна деталь, которой нет в брифе, — спрашиваешь, а не сочиняешь.
— Не пишешь «В современном мире» и прочие пустые вступления. Первая фраза — сразу по делу.
— Если запрос расплывчатый, задаёшь один-два уточняющих вопроса вместо того, чтобы выдать десять общих идей.

Формат ответа: обычный текст с короткими заголовками. Без markdown-таблиц.`

/* ───────────────────────────── Контекст клиента ───────────────────────── */

async function sbGet(url, headers) {
  const res = await fetch(url, { headers })
  if (!res.ok) return null
  return res.json()
}

async function sbInsert(supabaseUrl, table, headers, row) {
  return fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })
}

// Слепок Instagram: сколько подписчиков и что у клиента реально заходит.
// Собирается редко и складывается в строку чата — на каждой реплике ходить
// в Graph API значило бы добавлять секунды к каждому ответу.
async function fetchIgContext(igId, metaToken) {
  if (!igId || !metaToken) return null
  try {
    const profile = await (await fetch(
      `${GRAPH}/${igId}?fields=username,followers_count&access_token=${metaToken}`,
    )).json()
    if (profile.error) return null

    const media = await (await fetch(
      `${GRAPH}/${igId}/media?fields=timestamp,media_type,like_count,comments_count,caption&limit=25&access_token=${metaToken}`,
    )).json()
    if (media.error) return null

    const posts = media.data || []
    const byType = {}
    for (const p of posts) {
      const b = byType[p.media_type] || (byType[p.media_type] = { count: 0, eng: 0 })
      b.count++
      b.eng += (p.like_count || 0) + (p.comments_count || 0)
    }
    for (const b of Object.values(byType)) b.avg = Math.round(b.eng / b.count)

    const top = [...posts]
      .sort((a, b) => ((b.like_count || 0) + (b.comments_count || 0)) - ((a.like_count || 0) + (a.comments_count || 0)))
      .slice(0, 5)
      .map(p => ({
        type: p.media_type,
        eng: (p.like_count || 0) + (p.comments_count || 0),
        caption: (p.caption || '').slice(0, 200),
      }))

    return { username: profile.username, followers: profile.followers_count ?? null, byType, top }
  } catch {
    return null
  }
}

const TYPE_RU = { IMAGE: 'фото', VIDEO: 'reels', CAROUSEL_ALBUM: 'карусель' }

function renderContext(client, posts, ig) {
  const lines = [`Клиент: ${client.name}.`]

  if (client.brief) lines.push(`\nБриф:\n${client.brief}`)
  else lines.push('\nБрифа нет — если для сценария нужны детали о продукте или аудитории, спроси.')

  if (client.total_posts) {
    lines.push(`\nПлан: ${client.total_posts} постов в месяц, выпущено ${client.published_posts || 0}.`)
  }

  if (ig) {
    lines.push(`\nInstagram @${ig.username}${ig.followers ? `, ${ig.followers} подписчиков` : ''}.`)
    const types = Object.entries(ig.byType || {})
    if (types.length) {
      lines.push('Средние реакции по форматам за последние публикации: ' +
        types.map(([t, b]) => `${TYPE_RU[t] || t} — ${b.avg} (${b.count} шт.)`).join(', ') + '.')
    }
    if (ig.top?.length) {
      lines.push('\nЧто зашло лучше всего:')
      for (const p of ig.top) {
        lines.push(`— ${TYPE_RU[p.type] || p.type}, ${p.eng} реакций: ${p.caption.replace(/\s+/g, ' ') || 'без подписи'}`)
      }
    }
  }

  if (posts?.length) {
    lines.push('\nЧто уже стоит в контент-плане (чтобы не повторяться):')
    for (const p of posts.slice(0, 15)) lines.push(`— ${p.publish_date}: ${p.title}`)
  }

  return lines.join('\n')
}

/* ──────────────────────────────── Обработчик ──────────────────────────── */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' })

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const metaToken = (process.env.META_ACCESS_TOKEN || '').trim().replace(/^["']|["']$/g, '')

  if (!apiKey) {
    return res.status(500).json({ error: 'Сервер не сконфигурирован: нет ANTHROPIC_API_KEY в настройках Vercel' })
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Сервер не сконфигурирован: нет доступа к Supabase' })
  }

  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!accessToken) return res.status(401).json({ error: 'Не авторизован' })

  // Ходим в базу под токеном самого пользователя, а не сервисным ключом:
  // так RLS работает как обычно и сотрудник не вытянет чужого клиента.
  const sb = { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: sb })
  if (!userRes.ok) return res.status(401).json({ error: 'Сессия недействительна' })
  const user = await userRes.json()

  const { chatId, clientId, history, text } = req.body || {}
  if (!chatId || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Пустой запрос' })
  }
  const messages = [...(Array.isArray(history) ? history : []), { role: 'user', content: text }]

  // Ограничение по частоте.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const recent = await sbGet(
    `${supabaseUrl}/rest/v1/ai_usage?select=id&user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${hourAgo}`,
    sb,
  )
  if (Array.isArray(recent) && recent.length >= HOURLY_LIMIT) {
    return res.status(429).json({ error: 'Слишком много запросов за час. Попробуйте позже.' })
  }

  // Вопрос сохраняем до обращения к модели: даже если ответ не придёт,
  // он останется в переписке и его не придётся печатать заново.
  await sbInsert(supabaseUrl, 'ai_messages', sb, {
    chat_id: chatId, role: 'user', content: text, author_id: user.id,
  }).catch(() => {})

  /* Контекст клиента */
  let context = ''
  let client = null
  if (clientId) {
    const rows = await sbGet(
      `${supabaseUrl}/rest/v1/clients?select=id,name,brief,total_posts,published_posts,instagram_account_id&id=eq.${encodeURIComponent(clientId)}`,
      sb,
    )
    client = rows?.[0] || null
  }

  if (client) {
    const planRows = await sbGet(
      `${supabaseUrl}/rest/v1/posts?select=title,publish_date&client_id=eq.${encodeURIComponent(clientId)}&order=publish_date.desc&limit=15`,
      sb,
    )

    // Слепок Instagram живёт сутки. Читаем сохранённый, а если протух —
    // собираем заново и кладём обратно в строку чата.
    let ig = null
    if (chatId) {
      const chatRows = await sbGet(
        `${supabaseUrl}/rest/v1/ai_chats?select=ig_context,ig_context_at&id=eq.${encodeURIComponent(chatId)}`,
        sb,
      )
      const chat = chatRows?.[0]
      const fresh = chat?.ig_context_at && Date.now() - Date.parse(chat.ig_context_at) < 86_400_000
      if (fresh) ig = chat.ig_context
    }

    if (!ig && client.instagram_account_id) {
      ig = await fetchIgContext(client.instagram_account_id, metaToken)
      if (ig && chatId) {
        await fetch(`${supabaseUrl}/rest/v1/ai_chats?id=eq.${encodeURIComponent(chatId)}`, {
          method: 'PATCH',
          headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ ig_context: ig, ig_context_at: new Date().toISOString() }),
        }).catch(() => {})
      }
    }

    context = renderContext(client, planRows, ig)
  }

  /* Поток */
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  try {
    const anthropic = new Anthropic({ apiKey })

    // Инструкция и контекст клиента идут отдельными блоками, и кэш ставится на
    // последний: они не меняются в течение всей переписки, поэтому со второй
    // реплики этот кусок читается из кэша вдесятеро дешевле.
    const system = [
      { type: 'text', text: SYSTEM },
      ...(context ? [{ type: 'text', text: context, cache_control: { type: 'ephemeral' } }] : []),
    ]

    const trimmed = messages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
      .slice(-24)
      .map(m => ({ role: m.role, content: m.content }))

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages: trimmed,
    })

    stream.on('text', t => send({ t }))

    const final = await stream.finalMessage()

    // Ответ пишем здесь, а не в браузере: это единственное место, которое
    // доживает до конца генерации при любом поведении человека.
    const answer = (final.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
    if (answer.trim()) {
      await sbInsert(supabaseUrl, 'ai_messages', sb, {
        chat_id: chatId, role: 'assistant', content: answer, author_id: null,
      }).catch(() => {})
      fetch(`${supabaseUrl}/rest/v1/ai_chats?id=eq.${encodeURIComponent(chatId)}`, {
        method: 'PATCH',
        headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      }).catch(() => {})
    }

    const u = final.usage || {}
    const cost =
      ((u.input_tokens || 0) * PRICE.input +
       (u.output_tokens || 0) * PRICE.output +
       (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1_000_000

    // Журнал расхода пишем после ответа и не даём его сбою уронить ответ:
    // человек уже получил свой сценарий.
    fetch(`${supabaseUrl}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        client_id: clientId || null,
        kind: 'chat',
        model: MODEL,
        input_tokens: u.input_tokens || 0,
        output_tokens: u.output_tokens || 0,
        cache_read_tokens: u.cache_read_input_tokens || 0,
        cost_usd: Number(cost.toFixed(5)),
      }),
    }).catch(() => {})

    send({ done: true, cost: Number(cost.toFixed(4)) })
    res.end()
  } catch (e) {
    console.error('ai chat:', e)
    // Заголовки уже ушли, обычный res.status(500) сюда не годится —
    // сообщение об ошибке отдаём тем же потоком.
    // Настоящий текст ошибки лежит в error.error.message; e.message — это
    // строка целиком с кодом и JSON, читать её человеку тяжело.
    const detail = e?.error?.error?.message || e?.message || ''
    const message = e?.status === 401
      ? 'Ключ Anthropic не принят. Проверьте ANTHROPIC_API_KEY в настройках Vercel.'
      : e?.status === 429
        ? 'Anthropic ограничил частоту. Попробуйте через минуту.'
        : e?.status === 400
          ? `Запрос отклонён: ${detail}`
          : detail || 'Не удалось получить ответ'
    send({ error: message })
    res.end()
  }
}
