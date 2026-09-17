// Тексты сообщений бота.
//
// Функции чистые: получают уже собранные данные и возвращают строку. Запросы к
// базе делает api/telegram.js. Так тексты проверяются без сети, а сообщение
// «как оно выйдет в чат» видно прямо в тесте.
//
// Разметка — HTML Telegram: <b>, <i>, <a>. Всё, что пришло из базы, проходит
// через esc(): в именах клиентов и заголовках постов бывают < и &.

import { esc } from './telegram.js'

const DOW = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const POST_TYPE = { reels: 'рилс', post: 'пост', carousel: 'карусель', story: 'сторис' }

// 'YYYY-MM-DD' → «ЧТ · 17 сентября». Дата уже календарная, часовые пояса
// к ней не применяются.
export function dayLabel(dayIso) {
  const [y, m, d] = dayIso.split('-').map(Number)
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${dow} · ${d} ${MONTHS[m - 1]}`
}

const hhmm = t => (t || '').slice(0, 5)
const block = (title, lines) => (lines.length ? [`<b>${title}</b>`, ...lines].join('\n') : '')
const join = parts => parts.filter(Boolean).join('\n\n')

// Строка съёмки: «10:00 — Аквафор · студия · Данияр».
const shootLine = s => '• ' + [
  hhmm(s.time_start) || 'время не указано',
  esc(s.client?.name || 'без клиента'),
  esc(s.location || ''),
  [s.operator?.name, s.smm?.name].filter(Boolean).map(esc).join(' и '),
].filter(Boolean).join(' · ')

/**
 * Утренняя сводка дня.
 *
 * Пустые разделы не печатаются: сводка из одних заголовков «съёмок нет, задач
 * нет» читается хуже, чем короткая. Если пуст весь день, возвращается пустая
 * строка — api/telegram.js такое сообщение не отправляет.
 */
export function digestText({ date, shoots = [], tasks = [], recurring = [], posts = [] }) {
  const body = join([
    block('Съёмки', shoots.map(shootLine)),
    block('Задачи на сегодня', tasks.map(t => '• ' + [
      esc(t.title),
      esc(t.assignee?.name || ''),
      t.client?.name ? `<i>${esc(t.client.name)}</i>` : '',
    ].filter(Boolean).join(' · '))),
    block('По плану дня', recurring.map(r => `• ${r.at} — ${esc(r.title)}`)),
    block('Выкладка сегодня', posts.map(p => '• ' + [
      esc(p.client?.name || ''),
      esc(p.title || 'без названия'),
      POST_TYPE[p.post_type] || '',
    ].filter(Boolean).join(' · '))),
  ])
  if (!body) return ''
  return `🗓 <b>${dayLabel(date)}</b>\n\n${body}`
}

/** Вечерняя проверка: что из назначенного на сегодня так и не вышло. */
export function deadlineText({ date, posts = [] }) {
  if (!posts.length) return ''
  const lines = posts.map(p => '• ' + [
    esc(p.client?.name || ''),
    esc(p.title || 'без названия'),
    POST_TYPE[p.post_type] || '',
  ].filter(Boolean).join(' · '))
  return `⚠️ <b>Не опубликовано ${dayLabel(date)}</b>\n\n${lines.join('\n')}\n\n<i>Если пост вышел, отметьте его в контент-плане.</i>`
}

/** Напоминание о съёмке за несколько часов до начала. */
export function shootText({ shoot, hours }) {
  const when = hhmm(shoot.time_start)
  const head = when ? `📸 <b>Съёмка через ${hours} ч — в ${when}</b>` : '📸 <b>Съёмка завтра</b>'
  const lines = [
    `<b>${esc(shoot.client?.name || 'без клиента')}</b>`,
    shoot.location ? esc(shoot.location) : '',
    [shoot.operator?.name && `оператор ${esc(shoot.operator.name)}`,
      shoot.smm?.name && `СММ ${esc(shoot.smm.name)}`].filter(Boolean).join(' · '),
  ].filter(Boolean)
  return `${head}\n${dayLabel(shoot.shoot_date)}\n\n${lines.join('\n')}`
}

/**
 * Вопрос с кнопками и текущие ответы.
 *
 * Ответы дописываются в то же сообщение, а не отдельными репликами: иначе
 * простой вопрос разносит чат на десяток сообщений.
 */
export function askText({ question, answers = [], closed = false }) {
  const yes = answers.filter(a => a.answer === 'yes').map(a => esc(a.name))
  const no = answers.filter(a => a.answer === 'no').map(a => esc(a.name))
  const lines = [
    yes.length ? `✅ Да — ${yes.join(', ')}` : '',
    no.length ? `⬜ Ещё нет — ${no.join(', ')}` : '',
  ].filter(Boolean)
  const tail = lines.length ? lines.join('\n') : '<i>Пока никто не ответил</i>'
  return `❓ <b>${esc(question)}</b>\n\n${tail}${closed ? '\n\n<i>Вопрос закрыт</i>' : ''}`
}

/** Ответ на /план: план, выпущено и долг по каждому клиенту. */
export function planText({ rows = [] }) {
  if (!rows.length) return 'Ни у одного клиента не настроен счёт публикаций.'
  const line = r => {
    const bits = [`${r.done}/${r.plan}`]
    if (r.debt) bits.push(`долг ${r.debt - r.debtDone}`)
    else if (r.advance) bits.push(`аванс ${r.advance}`)
    if (r.closed) bits.push('план закрыт')
    return `• <b>${esc(r.name)}</b> — ${bits.join(' · ')}`
  }
  return `📊 <b>План публикаций</b>\n\n${rows.map(line).join('\n')}`
}

/** Ответ на /съёмки: сегодня и завтра. */
export function shootsText({ today = [], tomorrow = [] }) {
  const body = join([
    block('Сегодня', today.map(shootLine)),
    block('Завтра', tomorrow.map(shootLine)),
  ])
  return body ? `📸 <b>Съёмки</b>\n\n${body}` : 'На сегодня и завтра съёмок нет.'
}

export const HELP = [
  '<b>Что я умею</b>',
  '',
  '/today — сводка на сегодня',
  '/shoots — съёмки сегодня и завтра',
  '/plan — план и долг по клиентам',
  '/ask вопрос — задать чату вопрос с кнопками «Да / Ещё нет»',
  '/help — это сообщение',
  '',
  '<i>Команды понимаю и по-русски: /сегодня, /съёмки, /план, /вопрос, /помощь.</i>',
  '',
  'Сам пишу сюда утреннюю сводку, напоминания по расписанию, предупреждение о съёмке за 12 часов и список постов, которые не вышли в свой день.',
].join('\n')
