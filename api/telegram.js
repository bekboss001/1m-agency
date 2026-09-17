// Телеграм-бот агентства: отчёты, напоминания и дайджесты в рабочий чат.
//
// Одна функция на три входа — на тарифе Vercel Hobby их всего 12, и заводить
// под каждый вход свою расточительно:
//   POST с заголовком X-Telegram-Bot-Api-Secret-Token — обновление от Telegram
//        (команды и нажатия кнопок);
//   GET  с Bearer CRON_SECRET — тик расписания, его дёргает pg_cron в Supabase
//        раз в несколько минут (db/telegram_cron.sql);
//   POST с токеном вошедшего администратора — подключение и проверка из
//        раздела «Настройки».
//
// Что и когда отправляется — в server/tgSchedule.js, как выглядит сообщение —
// в server/tgFormat.js. Здесь только запросы к базе, отправка и учёт.

import { astanaClock, dueFixed, dueShoots, JOBS, SHOOT_LEAD_HOURS } from '../server/tgSchedule.js'
import * as F from '../server/tgFormat.js'
import { sendMessage, editMessageText, answerCallback, yesNoKeyboard, parseCallback, tg }
  from '../server/telegram.js'
import { planStateRow, PLAN_COLUMNS } from '../src/lib/postPlan.js'

const SHOOT_FIELDS = 'id,shoot_date,time_start,location,status,' +
  'client:client_id(name),operator:operator_id(name),smm:smm_id(name)'
const POST_FIELDS = 'id,title,post_type,publish_date,status,client:client_id(name)'
const TASK_FIELDS = 'id,title,assignee:assignee_id(name),client:client_id(name)'

// Команды бота. Telegram считает командой только латиницу, поэтому в группе
// работают левые написания; русские — в личной переписке с ботом.
const COMMANDS = {
  start: 'start', старт: 'start',
  help: 'help', помощь: 'help',
  today: 'today', сегодня: 'today',
  shoots: 'shoots', съёмки: 'shoots', съемки: 'shoots',
  plan: 'plan', план: 'plan',
  ask: 'ask', вопрос: 'ask',
}

// Какой тумблер в «Настройках» отвечает за какой вид рассылки.
const SWITCH = {
  digest: 'notif_digest',
  ask: 'notif_reminders',
  deadline: 'notif_deadline',
  shoot: 'notif_shoot',
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^["']|["']$/g, '')
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!token) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет TELEGRAM_BOT_TOKEN' })
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет доступа к Supabase' })

  const restWith = headers => async (method, path, body, prefer) => {
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
  const serviceRest = () => {
    if (!serviceKey) throw new Error('нет SUPABASE_SERVICE_ROLE_KEY')
    return restWith({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` })
  }

  /* ── 1. Обновление от Telegram ─────────────────────────────────────── */
  const hookHeader = req.headers['x-telegram-bot-api-secret-token']
  if (req.method === 'POST' && hookHeader !== undefined) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret || hookHeader !== secret) return res.status(401).json({ error: 'Не авторизован' })
    // Telegram шлёт обновление заново, пока не получит 200, и одна наша ошибка
    // превратилась бы в бесконечный поток повторов. Поэтому отвечаем 200
    // всегда, а неудачу оставляем в логе.
    try {
      await handleUpdate(req.body, token, serviceRest())
    } catch (e) {
      console.error('telegram update:', e)
    }
    return res.status(200).json({ ok: true })
  }

  /* ── 2. Тик расписания ─────────────────────────────────────────────── */
  if (req.method === 'GET') {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Не авторизован' })
    }
    try {
      return res.status(200).json(await tick(token, serviceRest()))
    } catch (e) {
      console.error('telegram tick:', e)
      return res.status(502).json({ error: 'Рассылка не выполнена: ' + e.message })
    }
  }

  /* ── 3. Из приложения, от администратора ───────────────────────────── */
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' })

  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return res.status(401).json({ error: 'Не авторизован' })
  const userHeaders = { apikey: anonKey, Authorization: `Bearer ${jwt}` }
  const rest = restWith(userHeaders)

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: userHeaders })
  if (!userRes.ok) return res.status(401).json({ error: 'Сессия недействительна' })
  const user = await userRes.json()
  const [profile] = await rest('GET', `profiles?select=role&id=eq.${encodeURIComponent(user.id)}`)
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' })

  try {
    const action = req.body?.action || 'status'

    if (action === 'connect') {
      // Адрес вебхука берём из самого запроса: это и есть адрес приложения,
      // и при переезде на другой домен менять ничего не нужно.
      const host = req.headers['x-forwarded-host'] || req.headers.host
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET
      if (!secret) return res.status(500).json({ error: 'Сервер не сконфигурирован: нет TELEGRAM_WEBHOOK_SECRET' })
      await tg(token, 'setWebhook', {
        url: `https://${host}/api/telegram`,
        secret_token: secret,
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        drop_pending_updates: true,
      })
      await tg(token, 'setMyCommands', {
        commands: [
          { command: 'today', description: 'Сводка на сегодня' },
          { command: 'shoots', description: 'Съёмки сегодня и завтра' },
          { command: 'plan', description: 'План и долг по клиентам' },
          { command: 'ask', description: 'Задать чату вопрос' },
          { command: 'help', description: 'Что я умею' },
        ],
      })
      return res.status(200).json({ ok: true, ...(await status(token, rest)) })
    }

    if (action === 'test') {
      const chats = await rest('GET', 'telegram_chats?select=chat_id,title&is_active=is.true')
      if (!chats?.length) return res.status(200).json({ ok: false, error: 'Бот ещё не добавлен ни в один чат' })
      const sent = []
      for (const c of chats) {
        await sendMessage(token, c.chat_id, '🤖 Проверка связи: бот на месте и пишет сюда.')
        sent.push(c.title || String(c.chat_id))
      }
      return res.status(200).json({ ok: true, sent })
    }

    return res.status(200).json(await status(token, rest))
  } catch (e) {
    console.error('telegram admin:', e)
    return res.status(502).json({ error: e.message })
  }
}

/* ══ Состояние для раздела «Настройки» ═══════════════════════════════ */

async function status(token, rest) {
  const [me, hook, chats] = await Promise.all([
    tg(token, 'getMe', {}).catch(e => ({ error: e.message })),
    tg(token, 'getWebhookInfo', {}).catch(e => ({ error: e.message })),
    rest('GET', 'telegram_chats?select=chat_id,title,is_active&order=added_at'),
  ])
  return {
    bot: me?.username ? `@${me.username}` : null,
    webhook: Boolean(hook?.url),
    webhookError: hook?.last_error_message || null,
    chats: chats || [],
  }
}

/* ══ Обновления от Telegram ══════════════════════════════════════════ */

async function handleUpdate(update, token, rest) {
  if (!update) return

  // Бота добавили в чат или убрали из него.
  if (update.my_chat_member) {
    const chat = update.my_chat_member.chat
    const inside = ['member', 'administrator', 'creator']
      .includes(update.my_chat_member.new_chat_member?.status)
    await rest('POST', 'telegram_chats', {
      chat_id: chat.id,
      title: chat.title || chat.username || String(chat.id),
      chat_type: chat.type,
      is_active: inside,
    }, 'resolution=merge-duplicates')
    if (inside) {
      await sendMessage(token, chat.id,
        'Здравствуйте. Я буду присылать сюда сводку дня, напоминания и предупреждения о съёмках.\n\n' + F.HELP)
    }
    return
  }

  if (update.callback_query) return handleCallback(update.callback_query, token, rest)
  if (update.message) return handleMessage(update.message, token, rest)
}

async function handleMessage(msg, token, rest) {
  const text = (msg.text || '').trim()
  if (!text.startsWith('/')) return

  // «/plan@agency_bot остальное» → имя команды и всё, что после неё.
  const words = text.split(/\s+/)
  const name = words[0].slice(1).split('@')[0].toLowerCase()
  const cmd = COMMANDS[name]
  if (!cmd) return
  const arg = words.slice(1).join(' ').trim()
  const chatId = msg.chat.id

  if (cmd === 'start') {
    await rest('POST', 'telegram_chats', {
      chat_id: chatId,
      title: msg.chat.title || msg.chat.username || String(chatId),
      chat_type: msg.chat.type,
      is_active: true,
    }, 'resolution=merge-duplicates')
    return sendMessage(token, chatId, 'Готово, этот чат подключён.\n\n' + F.HELP)
  }

  if (cmd === 'help') return sendMessage(token, chatId, F.HELP)

  if (cmd === 'ask') {
    if (!arg) {
      return sendMessage(token, chatId,
        'Напишите вопрос после команды: <code>/ask Все выложили сторис?</code>')
    }
    return ask(token, rest, chatId, arg)
  }

  const day = astanaClock().date

  if (cmd === 'today') {
    const digest = await buildDigest(rest, day)
    return sendMessage(token, chatId, digest || `На ${F.dayLabel(day)} дел не запланировано.`)
  }

  if (cmd === 'shoots') {
    const tomorrow = addDays(day, 1)
    const rows = await rest('GET',
      `shoots?select=${enc(SHOOT_FIELDS)}&shoot_date=gte.${day}&shoot_date=lte.${tomorrow}` +
      '&status=neq.cancelled&order=shoot_date,time_start')
    return sendMessage(token, chatId, F.shootsText({
      today: rows.filter(s => s.shoot_date === day),
      tomorrow: rows.filter(s => s.shoot_date === tomorrow),
    }))
  }

  if (cmd === 'plan') {
    const cols = PLAN_COLUMNS.replace(/\s/g, '')
    const rows = await rest('GET',
      `clients?select=${enc('name,' + cols)}&is_active=is.true&order=number`)
    return sendMessage(token, chatId, F.planText({
      rows: rows.map(r => ({ name: r.name, ...planStateRow(r) })),
    }))
  }
}

async function handleCallback(q, token, rest) {
  const parsed = parseCallback(q.data)
  if (!parsed) return answerCallback(token, q.id, '')

  const who = [q.from?.first_name, q.from?.last_name].filter(Boolean).join(' ')
    || q.from?.username || 'кто-то'

  await rest('POST', 'telegram_answers', {
    poll_id: parsed.pollId,
    tg_user_id: q.from.id,
    name: who,
    answer: parsed.answer,
    answered_at: new Date().toISOString(),
  }, 'resolution=merge-duplicates')

  const [poll] = await rest('GET',
    `telegram_polls?select=id,chat_id,message_id,question&id=eq.${parsed.pollId}`)
  if (!poll) return answerCallback(token, q.id, 'Вопрос не найден')

  const answers = await rest('GET',
    `telegram_answers?select=name,answer&poll_id=eq.${parsed.pollId}&order=answered_at`)

  try {
    await editMessageText(token, poll.chat_id, poll.message_id,
      F.askText({ question: poll.question, answers }),
      { reply_markup: yesNoKeyboard(poll.id) })
  } catch (e) {
    // Повторное нажатие той же кнопки ничего не меняет, и Telegram отвечает
    // ошибкой. Это не сбой: подтверждение человеку всё равно нужно.
    if (!/message is not modified/i.test(e.message)) throw e
  }

  return answerCallback(token, q.id, parsed.answer === 'yes' ? 'Записал: да' : 'Записал: ещё нет')
}

/* ══ Вопрос с кнопками ═══════════════════════════════════════════════ */

// Строка вопроса заводится до отправки: её id несут кнопки, а сообщение живёт
// дольше запуска функции, и нажатие потом разбирается с чистого листа.
async function ask(token, rest, chatId, question, job) {
  const [poll] = await rest('POST', 'telegram_polls', {
    chat_id: chatId,
    question,
    job_key: job?.key || null,
    run_on: job?.runOn || null,
  }, 'return=representation')

  const msg = await sendMessage(token, chatId, F.askText({ question }),
    { reply_markup: yesNoKeyboard(poll.id) })

  await rest('PATCH', `telegram_polls?id=eq.${poll.id}`, { message_id: msg.message_id })
  return msg
}

/* ══ Тик расписания ══════════════════════════════════════════════════ */

async function tick(token, rest, now = Date.now()) {
  const settings = Object.fromEntries(
    ((await rest('GET', 'app_settings?select=key,value')) || []).map(r => [r.key, r.value]))
  if (settings.integration_tg === false) {
    return { skipped: 'интеграция Telegram выключена в настройках' }
  }

  const chats = await rest('GET', 'telegram_chats?select=chat_id&is_active=is.true')
  if (!chats?.length) return { skipped: 'бот ещё не добавлен ни в один чат' }

  const clock = astanaClock(now)
  const jobs = dueFixed(now)

  // Съёмки берём на трое суток вперёд: напоминание уходит за 12 часов, и с
  // запасом на пропущенные тики этого хватает.
  const shootRows = await rest('GET',
    `shoots?select=${enc(SHOOT_FIELDS)}&shoot_date=gte.${clock.date}` +
    `&shoot_date=lte.${addDays(clock.date, 3)}&status=neq.cancelled&order=shoot_date,time_start`)
  jobs.push(...dueShoots(now, shootRows))

  const stats = { date: clock.date, time: clock.hhmm, sent: [], quiet: [], failed: [] }

  for (const job of jobs) {
    if (settings[SWITCH[job.kind]] === false) {
      stats.quiet.push(`${job.key}: выключено в настройках`)
      continue
    }

    for (const chat of chats) {
      // Занимаем пару (задание, дата) до отправки. Тик приходит каждые
      // несколько минут, и без этого одно напоминание ушло бы десяток раз.
      const claimed = await rest('POST', 'telegram_jobs', {
        job_key: job.key, run_on: job.runOn, chat_id: chat.chat_id,
      }, 'resolution=ignore-duplicates,return=representation')
      const claim = claimed?.[0]
      if (!claim) continue

      try {
        const msg = await runJob(job, token, rest, chat.chat_id, clock, shootRows)
        if (msg) {
          await rest('PATCH', `telegram_jobs?id=eq.${claim.id}`,
            { sent_at: new Date().toISOString(), message_id: msg.message_id })
          stats.sent.push(job.key)
        } else {
          // Говорить нечего — пустой день, ни одного просроченного поста.
          // Занятую строку оставляем: повторять проверку весь день незачем,
          // а сообщения «ничего нет» чат не просил.
          await rest('PATCH', `telegram_jobs?id=eq.${claim.id}`,
            { sent_at: new Date().toISOString(), quiet: true })
          stats.quiet.push(job.key)
        }
      } catch (e) {
        // Отпускаем занятую пару, чтобы следующий тик попробовал снова.
        await rest('DELETE', `telegram_jobs?id=eq.${claim.id}`)
        stats.failed.push(`${job.key}: ${e.message}`)
      }
    }
  }

  return stats
}

// Возвращает отправленное сообщение или null, если отправлять нечего.
async function runJob(job, token, rest, chatId, clock, shootRows) {
  if (job.kind === 'digest') {
    const digest = await buildDigest(rest, clock.date)
    return digest ? sendMessage(token, chatId, digest) : null
  }

  if (job.kind === 'deadline') {
    const posts = await rest('GET',
      `posts?select=${enc(POST_FIELDS)}&publish_date=eq.${clock.date}&status=neq.published&order=client_id`)
    const text = F.deadlineText({ date: clock.date, posts })
    return text ? sendMessage(token, chatId, text) : null
  }

  if (job.kind === 'shoot') {
    return sendMessage(token, chatId, F.shootText({ shoot: job.shoot, hours: SHOOT_LEAD_HOURS }))
  }

  if (job.kind === 'ask') {
    // «Согласовать съёмки на завтра» имеет смысл, только если они есть.
    if (job.needs === 'shoots_tomorrow') {
      const tomorrow = addDays(clock.date, 1)
      if (!shootRows.some(s => s.shoot_date === tomorrow)) return null
    }
    return ask(token, rest, chatId, job.question, job)
  }

  return null
}

async function buildDigest(rest, date) {
  const tomorrow = addDays(date, 1)
  // Съёмки берём сразу за два дня: завтрашние в сводку не идут, но по ним
  // видно, наступит ли сегодня в 18:00 «согласовать съёмки на завтра».
  const [shoots, tasks, posts] = await Promise.all([
    rest('GET', `shoots?select=${enc(SHOOT_FIELDS)}&shoot_date=gte.${date}&shoot_date=lte.${tomorrow}` +
      '&status=neq.cancelled&order=shoot_date,time_start'),
    rest('GET', `tasks?select=${enc(TASK_FIELDS)}&deadline=eq.${date}&status=neq.done`),
    rest('GET', `posts?select=${enc(POST_FIELDS)}&publish_date=eq.${date}&order=client_id`),
  ])
  const dow = new Date(Date.parse(date + 'T00:00:00Z')).getUTCDay()
  const hasShootsTomorrow = shoots.some(s => s.shoot_date === tomorrow)
  const recurring = JOBS
    .filter(j => j.kind === 'ask' && j.title && j.days.includes(dow))
    // Условные дела обещать с утра нельзя: если съёмок завтра нет, в 18:00
    // напоминание не придёт, и строка в сводке оказалась бы пустым обещанием.
    .filter(j => j.needs !== 'shoots_tomorrow' || hasShootsTomorrow)
    .map(j => ({ at: j.at, title: j.title }))
  return F.digestText({
    date, tasks, posts, recurring,
    shoots: shoots.filter(s => s.shoot_date === date),
  })
}

/* ══ Мелочи ══════════════════════════════════════════════════════════ */

const enc = s => encodeURIComponent(s)
const addDays = (iso, n) =>
  new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
