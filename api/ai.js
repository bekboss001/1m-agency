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
import { ASK_TOOL, renderAsk, validAsk } from './askTool.js'
import { renderBrief } from './briefFields.js'
import { TARGET_SYSTEM, renderTargetData } from './targetPrompt.js'
import {
  SCRIPT_TOOL, SCRIPT_SYSTEM, validScript, FORMAT_LABEL, GOAL_LABEL,
} from './scriptTool.js'

const MODEL = 'claude-opus-5'
const GRAPH = 'https://graph.facebook.com/v19.0'

// Тарифы Claude Opus 5, $ за миллион токенов. Нужны, чтобы писать в журнал
// расхода живые деньги, а не абстрактные токены.
const PRICE = { input: 5, output: 25, cacheRead: 0.5 }

// Потолок реплик в час на человека. Не про экономию — про защиту от цикла,
// в котором интерфейс шлёт запрос сам себе.
const HOURLY_LIMIT = 80

// Инструкция разделена надвое.
//
// CORE зашит в код и не редактируется: он держит механику. Стоит убрать из
// него описание инструмента ask, и уточняющие вопросы перестанут приходить
// кнопками, а разбираться, почему сломалось, будет некому.
//
// STYLE редактируется владельцем в Настройках. Это формат сценария и правила
// письма, то есть ровно то, что меняется по ходу работы и не должно требовать
// выкладки новой версии.
const SYSTEM_CORE = `Ты сценарист SMM-агентства 1M.AGENCY (Казахстан). Пишешь для Instagram: reels, карусели, посты, сторис.

ПЕРВАЯ РЕПЛИКА В НОВОЙ ЗАДАЧЕ
Начинай с уточняющих вопросов, и задавай их только вызовом инструмента ask. Текстом вопросы не пиши никогда: приложение рисует по вызову кнопки, а текст человеку пришлось бы перепечатывать.
Спрашивай о том, что нельзя вывести из брифа: длительность, цель, кто в кадре, язык, какой продукт из ассортимента.
Вместе с вызовом инструмента ничего не пиши. Никакого сценария авансом.
Исключение: если в запросе уже названы формат, длительность и цель, вопросы пропусти и сразу пиши сценарий.
Дальше в этой же переписке вопросы больше не задавай, если тебя не просят что-то поменять.`

// Правила письма, которые правит владелец в Настройках.
//
// Раньше здесь лежал ещё и формат сценария. Теперь форму ответа задаёт схема
// инструмента, и держать её вторым экземпляром в тексте значило бы иметь два
// источника правды, которые рано или поздно разойдутся. Осталось то, что
// схемой не выразить: язык, тон и запреты.
const SYSTEM_STYLE_DEFAULT = `ЯЗЫК И ТОН
Никогда не ставь длинное тире и среднее тире. Только запятая, двоеточие, скобки или точка. Это правило важнее красоты фразы: если без тире фраза не строится, перепиши фразу.
Никакой разметки: без звёздочек, решёток, подчёркиваний, таблиц. Текст копируют в Telegram как есть, и любой служебный символ там останется мусором.
Без пустых заходов вроде «В современном мире» и «В наше время». Первая фраза сразу по делу.
Без канцелярита: не «осуществляем доставку», а «привозим».
Обращение на вы, без панибратства и без восклицательных знаков подряд.

ЧЕГО НЕ ДЕЛАТЬ
Не выдумывай цифры, цены, сроки и условия. Чего нет в брифе клиента, то ставь меткой в двойных квадратных скобках прямо в текст, например [[срок ответа?]].
Не обещай того, чего в брифе нет.
Не сравнивай с конкурентами по названиям.

ЧТО УЧИТЫВАТЬ
Опирайся на то, что у клиента уже заходило, если эти данные есть в контексте.
Пиши на языке, на котором сформулирована тема ролика. Для казахоязычной аудитории можно на казахском.`

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

/* ─────────────────────── Общее для всех действий ──────────────────────── */

function startStream(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
}

// Расход в долларах, а не в токенах: токены сами по себе владельцу ничего не
// говорят. Пишется без await и без права уронить ответ: человек своё уже
// получил, и сбой журнала не повод показывать ему ошибку.
function logUsage({ supabaseUrl, sb, user, kind, clientId = null, usage }) {
  const u = usage || {}
  const cost =
    ((u.input_tokens || 0) * PRICE.input +
     (u.output_tokens || 0) * PRICE.output +
     (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1_000_000

  fetch(`${supabaseUrl}/rest/v1/ai_usage`, {
    method: 'POST',
    headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: user.id,
      client_id: clientId,
      kind,
      model: MODEL,
      input_tokens: u.input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      cache_read_tokens: u.cache_read_input_tokens || 0,
      cost_usd: Number(cost.toFixed(5)),
    }),
  }).catch(() => {})

  return Number(cost.toFixed(4))
}

// Заголовки к этому моменту уже ушли, обычный res.status(500) не годится.
// Настоящий текст ошибки лежит в error.error.message; e.message это строка
// целиком с кодом и JSON, читать её человеку тяжело.
function describeError(e) {
  const detail = e?.error?.error?.message || e?.message || ''
  if (e?.status === 401) return 'Ключ Anthropic не принят. Проверьте ANTHROPIC_API_KEY в настройках Vercel.'
  if (e?.status === 429) return 'Anthropic ограничил частоту. Попробуйте через минуту.'
  if (e?.status === 400) return `Запрос отклонён: ${detail}`
  return detail || 'Не удалось получить ответ'
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

  const brief = renderBrief(client.brief_data, client.brief)
  if (brief) lines.push('\nБриф:\n' + brief)
  else lines.push('\nБрифа нет. Если для сценария нужны детали о продукте или аудитории, спроси.')

  if (client.total_posts) {
    lines.push(`\nПлан: ${client.total_posts} постов в месяц, выпущено ${client.published_posts || 0}.`)
  }

  if (ig) {
    lines.push(`\nInstagram @${ig.username}${ig.followers ? `, ${ig.followers} подписчиков` : ''}.`)
    const types = Object.entries(ig.byType || {})
    if (types.length) {
      lines.push('Средние реакции по форматам за последние публикации: ' +
        types.map(([t, b]) => `${TYPE_RU[t] || t}: ${b.avg} (${b.count} шт.)`).join(', ') + '.')
    }
    if (ig.top?.length) {
      lines.push('\nЧто зашло лучше всего:')
      for (const p of ig.top) {
        lines.push(`${TYPE_RU[p.type] || p.type}, ${p.eng} реакций: ${p.caption.replace(/\s+/g, ' ') || 'без подписи'}`)
      }
    }
  }

  if (posts?.length) {
    lines.push('\nЧто уже стоит в контент-плане (чтобы не повторяться):')
    for (const p of posts.slice(0, 15)) lines.push(`${p.publish_date}: ${p.title}`)
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

  if (req.body?.action === 'prompt') {
    return res.status(200).json({ default: SYSTEM_STYLE_DEFAULT })
  }

  // Ограничение по частоте общее для всех действий: оно про защиту от цикла,
  // а циклу всё равно, что именно он шлёт.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const recent = await sbGet(
    `${supabaseUrl}/rest/v1/ai_usage?select=id&user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${hourAgo}`,
    sb,
  )
  if (Array.isArray(recent) && recent.length >= HOURLY_LIMIT) {
    return res.status(429).json({ error: 'Слишком много запросов за час. Попробуйте позже.' })
  }

  /* ───────────────────────── Разбор рекламы ──────────────────────────── */

  if (req.body?.action === 'analyze') {
    const { period, scope, rows, series } = req.body || {}
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Нет данных для разбора' })
    }

    const data = renderTargetData({ period, scope, rows, series })

    startStream(res)
    const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)

    try {
      const anthropic = new Anthropic({ apiKey })
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: 'medium' },
        // Инструкция стабильна, а выгрузка меняется каждый раз, поэтому кэш
        // ставим на инструкцию: иначе он не попадал бы ни разу.
        system: [{ type: 'text', text: TARGET_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: data }],
      })

      stream.on('text', t => send({ t }))
      const final = await stream.finalMessage()

      logUsage({ supabaseUrl, sb, user, kind: 'target', usage: final.usage })
      send({ done: true })
      res.end()
    } catch (e) {
      console.error('ai analyze:', e)
      send({ error: describeError(e) })
      res.end()
    }
    return
  }

  /* ──────────────────────────── Сценарий ─────────────────────────────── */

  if (req.body?.action === 'script') {
    const { clientId: scriptClient, format, goal, durationSec, topic, previous, instruction } = req.body || {}

    if (!FORMAT_LABEL[format] || !GOAL_LABEL[goal]) {
      return res.status(400).json({ error: 'Формат или цель не распознаны' })
    }
    const seconds = Math.round(Number(durationSec) || 0)
    if (seconds < 5 || seconds > 600) {
      return res.status(400).json({ error: 'Хронометраж вне допустимого' })
    }
    if (typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Не сказано, о чём ролик' })
    }

    // Контекст клиента тот же, что у остальных действий: бриф и то, что у
    // него заходит. Собирается здесь, а не приходит из браузера, чтобы
    // сотрудник не мог подсунуть чужого клиента.
    let context = ''
    if (scriptClient) {
      const rows = await sbGet(
        `${supabaseUrl}/rest/v1/clients?select=id,name,brief,brief_data,total_posts,published_posts,instagram_account_id&id=eq.${encodeURIComponent(scriptClient)}`,
        sb,
      )
      const client = rows?.[0]
      if (client) {
        const ig = client.instagram_account_id
          ? await fetchIgContext(client.instagram_account_id, metaToken)
          : null
        context = renderContext(client, null, ig)
      }
    }

    // Правила письма владельца. Структуру они не задают, её держит схема
    // инструмента, поэтому приписка про это обязательна: в сохранённом тексте
    // может лежать старое описание формата, и без оговорки модель начнёт
    // выбирать между ним и схемой.
    const styleRows = await sbGet(
      `${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.ai_script_prompt`,
      sb,
    )
    const customStyle = typeof styleRows?.[0]?.value === 'string' ? styleRows[0].value.trim() : ''
    const style = customStyle
      ? 'Ниже правила письма от владельца агентства. Они касаются только языка, тона и запретов. ' +
        'Форму ответа они не меняют: отвечать всё равно вызовом инструмента script, ролями hook, core, ' +
        'argument, cta. Всё, что в этих правилах похоже на описание формата или разметки сценария, ' +
        'игнорируй.\n\n' + customStyle
      : SYSTEM_STYLE_DEFAULT

    const brief = [
      `Формат: ${FORMAT_LABEL[format]}.`,
      `Цель ролика: ${GOAL_LABEL[goal]}.`,
      `Хронометраж: ${seconds} секунд.`,
      `О чём ролик: ${topic.trim().slice(0, 2000)}`,
    ].join('\n')

    // Правка это не новый сценарий с нуля: модель получает предыдущую версию
    // целиком и меняет в ней только то, о чём просят. Иначе каждая правка
    // переписывала бы удачные реплики заодно с неудачными.
    const task = instruction
      ? [
          brief, '',
          'Текущая версия сценария:',
          JSON.stringify(previous, null, 1).slice(0, 8000), '',
          `Что поправить: ${String(instruction).slice(0, 500)}`,
          'Верни сценарий целиком. Реплики, которых правка не касается, оставь дословно как есть.',
        ].join('\n')
      : brief

    startStream(res)
    const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)

    try {
      const anthropic = new Anthropic({ apiKey })
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 6000,
        output_config: { effort: 'medium' },
        // Инструмент единственный, и отвечать модель обязана только им:
        // без принуждения она иногда пишет сценарий текстом рядом.
        tools: [SCRIPT_TOOL],
        tool_choice: { type: 'tool', name: 'script' },
        system: [
          { type: 'text', text: SCRIPT_SYSTEM + '\n\n' + style },
          ...(context ? [{ type: 'text', text: context, cache_control: { type: 'ephemeral' } }] : []),
        ],
        messages: [{ role: 'user', content: task }],
      })

      const final = await stream.finalMessage()

      const block = (final.content || []).find(b => b.type === 'tool_use' && b.name === 'script')
      const script = block ? validScript(block.input, seconds) : null

      const cost = logUsage({
        supabaseUrl, sb, user, kind: 'script',
        clientId: scriptClient || null, usage: final.usage,
      })

      if (!script) {
        send({ error: 'Модель вернула сценарий не в том виде. Попробуйте ещё раз.' })
        res.end()
        return
      }

      send({ script, cost, done: true })
      res.end()
    } catch (e) {
      console.error('ai script:', e)
      send({ error: describeError(e) })
      res.end()
    }
    return
  }

  const { chatId, clientId, history, text } = req.body || {}

  // Браузер может держать сборку, выпущенную до этой функции: страницу не
  // перезагружали с прошлого деплоя. Прежний формат запроса узнаём по полю
  // messages и говорим об этом прямо. Принимать старый формат нельзя — та
  // сборка сохраняла реплики сама, и вместе с серверной записью получились
  // бы дубликаты.
  if (typeof text !== 'string' && Array.isArray(req.body?.messages)) {
    return res.status(409).json({
      error: 'Открыта устаревшая версия приложения. Обновите страницу и повторите. Вопрос сохранён в поле ввода.',
    })
  }

  if (!chatId) return res.status(400).json({ error: 'Чат не выбран' })
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Вопрос пустой' })
  }
  const messages = [...(Array.isArray(history) ? history : []), { role: 'user', content: text }]

  // Вопрос сохраняем до обращения к модели: даже если ответ не придёт,
  // он останется в переписке и его не придётся печатать заново.
  await sbInsert(supabaseUrl, 'ai_messages', sb, {
    chat_id: chatId, role: 'user', content: text, author_id: user.id,
  }).catch(() => {})

  const promptRows = await sbGet(
    `${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.ai_script_prompt`,
    sb,
  )
  // Пустое значение и отсутствие таблицы одинаково возвращают нас ко
  // встроенному шаблону: инструкция без формата дала бы сценарии без формата.
  const custom = typeof promptRows?.[0]?.value === 'string' ? promptRows[0].value.trim() : ''
  const SYSTEM = SYSTEM_CORE + '\n\n' + (custom || SYSTEM_STYLE_DEFAULT)

  /* Контекст клиента */
  let context = ''
  let client = null
  if (clientId) {
    const rows = await sbGet(
      `${supabaseUrl}/rest/v1/clients?select=id,name,brief,brief_data,total_posts,published_posts,instagram_account_id&id=eq.${encodeURIComponent(clientId)}`,
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
  startStream(res)
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
      output_config: { effort: 'medium' },
      tools: [ASK_TOOL],
      system,
      messages: trimmed,
    })

    stream.on('text', t => send({ t }))

    const final = await stream.finalMessage()

    // Ответ пишем здесь, а не в браузере: это единственное место, которое
    // доживает до конца генерации при любом поведении человека.
    const spoken = (final.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    const askBlock = (final.content || []).find(b => b.type === 'tool_use' && b.name === 'ask')
    const ask = askBlock ? validAsk(askBlock.input) : null

    // Когда модель спрашивает, вопросы и есть содержание реплики. В content
    // они кладутся текстом: кнопки живут в интерфейсе, а история для модели и
    // старые сборки приложения должны читаться и без них.
    const answer = ask
      ? [spoken.trim(), renderAsk(ask)].filter(Boolean).join('\n\n')
      : spoken

    if (answer.trim()) {
      await sbInsert(supabaseUrl, 'ai_messages', sb, {
        chat_id: chatId, role: 'assistant', content: answer, author_id: null,
        meta: ask ? { ask } : null,
      }).catch(() => {})
      fetch(`${supabaseUrl}/rest/v1/ai_chats?id=eq.${encodeURIComponent(chatId)}`, {
        method: 'PATCH',
        headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      }).catch(() => {})
    }

    const cost = logUsage({ supabaseUrl, sb, user, kind: 'chat', clientId: clientId || null, usage: final.usage })

    send({ done: true, cost, ask })
    res.end()
  } catch (e) {
    console.error('ai chat:', e)
    send({ error: describeError(e) })
    res.end()
  }
}
